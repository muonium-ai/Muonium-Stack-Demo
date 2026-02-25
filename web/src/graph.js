export class GrafeoAdapter {
  constructor() {
    this.ready = false;
    this.db = null;
  }

  async init() {
    try {
      const moduleName = '@grafeo-db/wasm';
      const grafeo = await import(/* @vite-ignore */ moduleName);
      if (grafeo?.GrafeoDB?.create) {
        this.db = await grafeo.GrafeoDB.create();
        this.ready = true;
      }
    } catch {
      this.ready = false;
    }
  }

  async indexGames(games) {
    if (!this.ready || !this.db) {
      return;
    }

    for (const game of games) {
      const white = String(game.white_player).replace(/'/g, "\\'");
      const black = String(game.black_player).replace(/'/g, "\\'");
      const event = String(game.event).replace(/'/g, "\\'");
      await this.db.execute(`INSERT (:Player {name: '${white}'})`);
      await this.db.execute(`INSERT (:Player {name: '${black}'})`);
      await this.db.execute(`INSERT (:Game {id: ${game.id}, event: '${event}'})`);
    }
  }
}
