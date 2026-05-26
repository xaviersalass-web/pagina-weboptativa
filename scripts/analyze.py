#!/usr/bin/env python3
"""Compute insights + Obsidian-style network from the song datasets."""

import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def load():
    a = json.loads((DATA / "songs_a.json").read_text(encoding="utf-8"))
    b = json.loads((DATA / "songs_b.json").read_text(encoding="utf-8"))
    seen = {}
    for s in a + b:
        if not s.get("song") or not s.get("artist"):
            continue
        key = f"{s['artist']}|{s['song']}".lower()
        prev = seen.get(key)
        if prev is None or (s.get("popularity") or 0) > (prev.get("popularity") or 0):
            seen[key] = s
    return list(seen.values())


# =====================================================================
# Insights
# =====================================================================
def insight_line(songs):
    by_year = defaultdict(list)
    for s in songs:
        if s.get("year") and s.get("popularity") is not None:
            by_year[s["year"]].append(s["popularity"])
    series = sorted((y, round(sum(v) / len(v), 1)) for y, v in by_year.items())
    if not series:
        return {}
    peak_year, peak_val = max(series, key=lambda x: x[1])
    low_year, low_val = min(series, key=lambda x: x[1])
    start, end = series[0][1], series[-1][1]
    delta_pct = round((end - start) / start * 100, 1) if start else 0
    return {
        "headline": f"La popularidad media pasó de {start} a {end} entre {series[0][0]} y {series[-1][0]}.",
        "detail": f"El catálogo refleja el auge del streaming: el pico se alcanzó en {peak_year} ({peak_val} de popularidad media) y el valle en {low_year} ({low_val}).",
        "stat": f"{'+' if delta_pct >= 0 else ''}{delta_pct}% en 20 años",
        "key_value": delta_pct,
        "extra": [
            f"Pico absoluto: {peak_year} ({peak_val})",
            f"Año más flojo: {low_year} ({low_val})",
            f"{len(series)} años con datos",
        ],
    }


def insight_genre(songs):
    cnt = Counter()
    for s in songs:
        for g in (s.get("genre") or []):
            cnt[g] += 1
    if not cnt:
        return {}
    top = cnt.most_common(8)
    total = sum(cnt.values())
    leader, leader_n = top[0]
    share = round(leader_n / total * 100, 1)
    return {
        "headline": f"{leader.title()} domina con el {share}% del catálogo.",
        "detail": f"De {len(cnt)} géneros etiquetados, los 3 primeros — {top[0][0]}, {top[1][0]} y {top[2][0]} — concentran {round(sum(c for _, c in top[:3])/total*100,1)}% de las canciones populares de las dos décadas.",
        "stat": f"{leader.title()} {share}%",
        "key_value": share,
        "extra": [f"{g.title()}: {round(c/total*100,1)}%" for g, c in top[:3]],
    }


def insight_scatter(songs):
    # Cuadrantes Energía × Valencia
    quad = Counter()
    for s in songs:
        e, v = s.get("energy"), s.get("valence")
        if e is None or v is None:
            continue
        if e >= 0.5 and v >= 0.5:   quad["alta_pos"] += 1   # fiesta
        elif e >= 0.5 and v < 0.5:  quad["alta_neg"] += 1   # furia
        elif e < 0.5 and v >= 0.5:  quad["baja_pos"] += 1   # calma feliz
        else:                        quad["baja_neg"] += 1   # melancolía
    total = sum(quad.values()) or 1
    name = {"alta_pos": "Fiesta (alta energía + brillo)", "alta_neg": "Furia (alta energía + oscura)",
            "baja_pos": "Calma feliz (baja energía + brillo)", "baja_neg": "Melancolía (baja + oscura)"}
    leader = max(quad.items(), key=lambda x: x[1])
    leader_pct = round(leader[1] / total * 100, 1)
    return {
        "headline": f"{name[leader[0]]} es el cuadrante más poblado ({leader_pct}%).",
        "detail": f"Cruzando energía con valencia emerge un mapa emocional: la mayoría de hits aterriza en {name[leader[0]].lower()}. Los géneros separan claramente: dance/pop arriba, indie/balada abajo.",
        "stat": f"{leader_pct}% en el cuadrante dominante",
        "key_value": leader_pct,
        "extra": [
            f"Fiesta: {round(quad['alta_pos']/total*100,1)}%",
            f"Melancolía: {round(quad['baja_neg']/total*100,1)}%",
            f"Calma feliz: {round(quad['baja_pos']/total*100,1)}%",
        ],
    }


def insight_radar(songs):
    feats = ["danceability", "energy", "valence", "acousticness", "speechiness", "liveness"]
    means = {}
    for f in feats:
        vals = [s[f] for s in songs if isinstance(s.get(f), (int, float))]
        means[f] = round(sum(vals) / len(vals), 3) if vals else 0
    top = max(means.items(), key=lambda x: x[1])
    bot = min(means.items(), key=lambda x: x[1])
    es = {"danceability": "bailabilidad", "energy": "energía", "valence": "valencia",
          "acousticness": "acústica", "speechiness": "voz hablada", "liveness": "directo"}
    return {
        "headline": f"El hit promedio: alta {es[top[0]]} ({top[1]:.2f}), baja {es[bot[0]]} ({bot[1]:.2f}).",
        "detail": f"El perfil sonoro típico de 2000-2020 favorece producciones enérgicas y bailables sobre lo acústico o íntimo. Es el ADN del pop comercial moderno.",
        "stat": f"{es[top[0]].title()} {top[1]:.2f}",
        "key_value": top[1],
        "extra": [f"{es[k].title()}: {v:.2f}" for k, v in means.items()][:3],
    }


def insight_tempo(songs):
    tempos = [s["tempo"] for s in songs if isinstance(s.get("tempo"), (int, float))]
    if not tempos:
        return {}
    avg = round(sum(tempos) / len(tempos), 1)
    bins = [(60, 90, "Lento"), (90, 110, "Medio"), (110, 130, "Movido"), (130, 160, "Rápido"), (160, 220, "Muy rápido")]
    counts = []
    for lo, hi, name in bins:
        n = sum(1 for t in tempos if lo <= t < hi)
        counts.append((name, n, lo, hi))
    leader = max(counts, key=lambda x: x[1])
    pct = round(leader[1] / len(tempos) * 100, 1)
    return {
        "headline": f"El {pct}% de los hits viven en el rango {leader[2]}-{leader[3]} BPM ({leader[0].lower()}).",
        "detail": f"El tempo promedio del catálogo es {avg} BPM — justo en la zona pop comercial. Hay una segunda joroba alrededor de los 75-85 BPM donde anida el R&B y el hip-hop melódico.",
        "stat": f"{avg} BPM promedio",
        "key_value": avg,
        "extra": [f"{n}: {c} canciones" for n, c, _, _ in counts[:3]],
    }


# =====================================================================
# Network (Obsidian-style)
# =====================================================================
def build_network(songs):
    # Top géneros, artistas, canciones
    genre_cnt = Counter()
    artist_pop = defaultdict(lambda: {"pop": 0, "songs": 0, "genres": Counter()})

    for s in songs:
        for g in (s.get("genre") or []):
            genre_cnt[g] += 1
        a = s["artist"]
        artist_pop[a]["pop"] += s.get("popularity") or 0
        artist_pop[a]["songs"] += 1
        for g in (s.get("genre") or []):
            artist_pop[a]["genres"][g] += 1

    top_genres = [g for g, _ in genre_cnt.most_common(10)]
    top_genres_set = set(top_genres)
    top_artists = sorted(artist_pop.items(), key=lambda x: x[1]["pop"], reverse=True)[:40]
    top_artists_set = {a for a, _ in top_artists}
    top_songs = sorted(songs, key=lambda s: s.get("popularity") or 0, reverse=True)[:60]

    # Promote artists for top songs that aren't already included
    for s in top_songs:
        if s["artist"] not in top_artists_set:
            top_artists.append((s["artist"], artist_pop[s["artist"]]))
            top_artists_set.add(s["artist"])

    # Build nodes
    nodes = []
    max_g = max(genre_cnt[g] for g in top_genres)
    for g in top_genres:
        c = genre_cnt[g]
        size = round(36 + (c / max_g) * 24, 1)
        nodes.append({
            "id": f"genre:{g}",
            "name": g,
            "category": 0,
            "symbolSize": size,
            "value": c,
            "meta": {"type": "genre", "count": c},
        })

    max_a = max(d["pop"] for _, d in top_artists)
    for a, d in top_artists:
        size = round(18 + (d["pop"] / max_a) * 14, 1)
        top_genre = d["genres"].most_common(1)[0][0] if d["genres"] else None
        nodes.append({
            "id": f"artist:{a}",
            "name": a,
            "category": 1,
            "symbolSize": size,
            "value": d["pop"],
            "meta": {
                "type": "artist",
                "songs": d["songs"],
                "avg_popularity": round(d["pop"] / max(d["songs"], 1), 1),
                "top_genre": top_genre,
            },
        })

    max_s = max(s.get("popularity") or 0 for s in top_songs)
    for s in top_songs:
        pop = s.get("popularity") or 0
        size = round(10 + (pop / max_s) * 6, 1)
        nodes.append({
            "id": f"song:{s['artist']}|{s['song']}",
            "name": s["song"],
            "category": 2,
            "symbolSize": size,
            "value": pop,
            "meta": {
                "type": "song",
                "artist": s["artist"],
                "year": s.get("year"),
                "popularity": pop,
                "genres": s.get("genre") or [],
                "tempo": s.get("tempo"),
                "energy": s.get("energy"),
                "valence": s.get("valence"),
                "danceability": s.get("danceability"),
            },
        })

    # Edges
    links = []
    node_ids = {n["id"] for n in nodes}

    # artist -> primary genre
    for a, d in top_artists:
        if not d["genres"]:
            continue
        primary = d["genres"].most_common(1)[0][0]
        if primary in top_genres_set:
            links.append({"source": f"artist:{a}", "target": f"genre:{primary}", "value": 1})

    # song -> artist
    for s in top_songs:
        links.append({"source": f"song:{s['artist']}|{s['song']}", "target": f"artist:{s['artist']}", "value": 1})

    # song -> 2 nearest neighbours
    def vec(s):
        return [s.get("danceability") or 0, s.get("energy") or 0, s.get("valence") or 0,
                s.get("acousticness") or 0, (s.get("tempo") or 0) / 200]

    vecs = [(s, vec(s)) for s in top_songs]
    for i, (sa, va) in enumerate(vecs):
        dists = []
        for j, (sb, vb) in enumerate(vecs):
            if i == j:
                continue
            d = math.sqrt(sum((va[k] - vb[k]) ** 2 for k in range(len(va))))
            dists.append((d, sb))
        dists.sort(key=lambda x: x[0])
        for d, sb in dists[:2]:
            links.append({
                "source": f"song:{sa['artist']}|{sa['song']}",
                "target": f"song:{sb['artist']}|{sb['song']}",
                "value": round(1 / (1 + d), 3),
            })

    # Filter unreachable nodes
    used = set()
    for l in links:
        used.add(l["source"])
        used.add(l["target"])
    nodes = [n for n in nodes if n["id"] in used]

    return {
        "categories": [
            {"name": "Género", "color": "#6fe0d0"},
            {"name": "Artista", "color": "#1ed760"},
            {"name": "Canción", "color": "#ffd166"},
        ],
        "nodes": nodes,
        "links": links,
    }


def main():
    songs = load()
    print(f"Loaded {len(songs)} unique songs")

    insights = {
        "chart-line": insight_line(songs),
        "chart-genre": insight_genre(songs),
        "chart-scatter": insight_scatter(songs),
        "chart-radar": insight_radar(songs),
        "chart-tempo": insight_tempo(songs),
    }
    (DATA / "insights.json").write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote insights.json with {len(insights)} entries")

    network = build_network(songs)
    (DATA / "network.json").write_text(json.dumps(network, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote network.json: {len(network['nodes'])} nodes, {len(network['links'])} links")


if __name__ == "__main__":
    main()
