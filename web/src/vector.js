function embeddingFromText(text) {
  const dim = 16;
  const vector = new Array(dim).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    vector[index % dim] += text.charCodeAt(index) / 255;
  }
  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export class MuonVecAdapter {
  constructor() {
    this.items = [];
  }

  upsertGames(games) {
    this.items = games.map((game) => ({
      game,
      vector: embeddingFromText(`${game.event} ${game.white_player} ${game.black_player}`),
    }));
  }

  search(query, topK = 5) {
    const q = embeddingFromText(query);
    return this.items
      .map((item) => ({
        score: cosineSimilarity(item.vector, q),
        game: item.game,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
