export function createStockfishService({ scriptUrl = '/stockfish/stockfish.js' } = {}) {
  let engine = null;
  let isReady = false;
  let scriptLoadPromise = null;
  let queue = Promise.resolve();
  let lastError = '';

  const scriptDirectory = (() => {
    const withoutQuery = String(scriptUrl || '').split('?')[0];
    const lastSlashIndex = withoutQuery.lastIndexOf('/');
    if (lastSlashIndex <= 0) {
      return '/stockfish';
    }
    return withoutQuery.slice(0, lastSlashIndex);
  })();

  const loadScript = () => {
    if (typeof window === 'undefined') {
      return Promise.resolve(false);
    }

    if (window.Stockfish) {
      return Promise.resolve(true);
    }

    if (scriptLoadPromise) {
      return scriptLoadPromise;
    }

    scriptLoadPromise = new Promise((resolve) => {
      const scriptEl = document.createElement('script');
      scriptEl.src = scriptUrl;
      scriptEl.async = true;
      scriptEl.onload = () => {
        resolve(Boolean(window.Stockfish));
      };
      scriptEl.onerror = () => {
        resolve(false);
      };
      document.head.appendChild(scriptEl);
    });

    return scriptLoadPromise;
  };

  const waitForLine = (predicate, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      if (!engine) {
        reject(new Error('Stockfish engine not initialized'));
        return;
      }

      const onMessage = (lineText) => {
        const text = String(lineText ?? '');
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        for (const line of lines) {
          if (predicate(line)) {
            cleanup();
            resolve(line);
            return;
          }
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Stockfish response timeout'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        engine?.removeMessageListener(onMessage);
      };

      engine.addMessageListener(onMessage);
    });

  const postAndWaitForLine = async (command, predicate, timeoutMs = 15000) => {
    const waitPromise = waitForLine(predicate, timeoutMs);
    engine.postMessage(command);
    return waitPromise;
  };

  const runExclusive = (task) => {
    queue = queue.then(task, task);
    return queue;
  };

  const init = async () => {
    if (isReady) {
      return true;
    }

    return runExclusive(async () => {
      if (isReady) {
        return true;
      }

      try {
        const loaded = await loadScript();
        if (!loaded || !window.Stockfish) {
          lastError = 'Stockfish script not loaded';
          engine = null;
          isReady = false;
          return false;
        }

        const stockfishGlobal = window.Stockfish;
        const moduleConfig = {
          locateFile: (fileName) => `${scriptDirectory}/${fileName}`,
          mainScriptUrlOrBlob: scriptUrl,
        };
        if (typeof stockfishGlobal === 'function') {
          engine = await stockfishGlobal(moduleConfig);
        } else if (stockfishGlobal && typeof stockfishGlobal.then === 'function') {
          const resolved = await stockfishGlobal;
          engine =
            typeof resolved === 'function'
              ? await resolved(moduleConfig)
              : resolved;
        } else {
          engine = stockfishGlobal;
        }

        if (!engine) {
          lastError = 'Stockfish factory returned no engine instance';
          isReady = false;
          return false;
        }

        if (
          typeof engine.postMessage !== 'function' ||
          typeof engine.addMessageListener !== 'function'
        ) {
          lastError = 'Stockfish engine API mismatch';
          isReady = false;
          engine = null;
          return false;
        }

        await postAndWaitForLine('uci', (line) => line === 'uciok');
        await postAndWaitForLine('isready', (line) => line === 'readyok');
        lastError = '';
        isReady = true;
        return true;
      } catch (error) {
        lastError = error?.message || 'Stockfish init failed';
        engine = null;
        isReady = false;
        return false;
      }
    });
  };

  const getBestMove = async ({ uciMoves = [], depth = 10 } = {}) => {
    if (!isReady || !engine) {
      throw new Error('Stockfish service not ready');
    }

    return runExclusive(async () => {
      const safeMoves = Array.isArray(uciMoves)
        ? uciMoves.map((move) => String(move || '').trim()).filter(Boolean)
        : [];
      const safeDepth = Math.max(1, Number(depth) || 1);

      engine.postMessage(`position startpos moves ${safeMoves.join(' ')}`);
      const line = await postAndWaitForLine(
        `go depth ${safeDepth}`,
        (text) => text.startsWith('bestmove '),
      );
      const bestMove = line.split(/\s+/)[1] || '(none)';
      return { bestMove, raw: line };
    });
  };

  const dispose = () => {
    if (engine && typeof engine.terminate === 'function') {
      engine.terminate();
    }
    engine = null;
    isReady = false;
    queue = Promise.resolve();
  };

  return {
    init,
    getBestMove,
    dispose,
    isReady: () => isReady,
    getLastError: () => lastError,
  };
}
