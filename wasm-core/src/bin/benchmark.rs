use regex::Regex;
use shakmaty::san::San;
use shakmaty::{Chess, Position};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone)]
struct ParsedGame {
    moves_san: Vec<String>,
}

#[derive(Debug, Clone)]
struct Args {
    dataset: String,
    mode: String,
    limit: usize,
    help: bool,
}

fn parse_args(raw: &[String]) -> Args {
    let mut args = Args {
        dataset: "carlsen".to_string(),
        mode: "parse".to_string(),
        limit: 0,
        help: false,
    };

    let mut index = 0usize;
    while index < raw.len() {
        let token = raw[index].as_str();
        match token {
            "--help" | "-h" => {
                args.help = true;
            }
            "--dataset" => {
                if index + 1 < raw.len() {
                    args.dataset = raw[index + 1].clone();
                    index += 1;
                }
            }
            "--mode" => {
                if index + 1 < raw.len() {
                    args.mode = raw[index + 1].clone();
                    index += 1;
                }
            }
            "--limit" => {
                if index + 1 < raw.len() {
                    args.limit = raw[index + 1].parse::<usize>().unwrap_or(0);
                    index += 1;
                }
            }
            _ => {
                if let Some(value) = token.strip_prefix("--dataset=") {
                    args.dataset = value.to_string();
                } else if let Some(value) = token.strip_prefix("--mode=") {
                    args.mode = value.to_string();
                } else if let Some(value) = token.strip_prefix("--limit=") {
                    args.limit = value.parse::<usize>().unwrap_or(0);
                }
            }
        }

        index += 1;
    }

    args.mode = args.mode.to_lowercase();
    args
}

fn print_help() {
    println!("Rust chess benchmark CLI");
    println!();
    println!("Usage:");
    println!("  cargo run --bin benchmark -- [--dataset carlsen|anand|/abs/path.pgn] [--mode parse|replay] [--limit N]");
    println!();
    println!("Defaults:");
    println!("  --dataset carlsen");
    println!("  --mode parse");
    println!("  --limit 0 (all games)");
}

fn find_repo_root() -> Result<PathBuf, String> {
    let current = env::current_dir().map_err(|error| format!("Unable to read current dir: {error}"))?;

    if current.join("wasm-core").is_dir() {
        return Ok(current);
    }

    if current
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name == "wasm-core")
        .unwrap_or(false)
    {
        if let Some(parent) = current.parent() {
            return Ok(parent.to_path_buf());
        }
    }

    Err("Unable to locate repository root. Run from repo root or wasm-core/.".to_string())
}

fn resolve_dataset_path(repo_root: &Path, dataset: &str) -> PathBuf {
    match dataset.to_lowercase().as_str() {
        "carlsen" => repo_root.join("chess").join("games").join("Carlsen.pgn"),
        "anand" => repo_root.join("chess").join("games").join("Anand.pgn"),
        _ => {
            let path = PathBuf::from(dataset);
            if path.is_absolute() {
                path
            } else {
                repo_root.join(path)
            }
        }
    }
}

fn parse_tag(block: &str, key: &str) -> String {
    let needle = format!("[{} \"", key);
    if let Some(start) = block.find(&needle) {
        let value_start = start + needle.len();
        if let Some(end_rel) = block[value_start..].find("\"]") {
            return block[value_start..value_start + end_rel].trim().to_string();
        }
    }
    "?".to_string()
}

fn strip_pgn_noise(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_comment = false;
    let mut variation_depth = 0usize;

    for ch in text.chars() {
        match ch {
            '{' => in_comment = true,
            '}' => in_comment = false,
            '(' => {
                if !in_comment {
                    variation_depth += 1;
                }
            }
            ')' => {
                if !in_comment && variation_depth > 0 {
                    variation_depth -= 1;
                }
            }
            _ => {
                if !in_comment && variation_depth == 0 {
                    out.push(ch);
                }
            }
        }
    }

    out
}

fn parse_moves(move_text: &str) -> Vec<String> {
    let move_num_regex = Regex::new(r"^\d+\.{1,3}$").expect("valid regex");
    let nag_regex = Regex::new(r"^\$\d+$").expect("valid regex");
    let cleaned = strip_pgn_noise(move_text);

    cleaned
        .split_whitespace()
        .filter_map(|token| {
            let tok = token.trim();
            if tok.is_empty() {
                return None;
            }
            if move_num_regex.is_match(tok) {
                return None;
            }
            if nag_regex.is_match(tok) {
                return None;
            }
            match tok {
                "1-0" | "0-1" | "1/2-1/2" | "*" => None,
                _ => Some(tok.to_string()),
            }
        })
        .collect()
}

fn split_games(pgn_text: &str) -> Vec<ParsedGame> {
    let normalized = pgn_text.replace("\r\n", "\n");
    let chunks: Vec<String> = normalized
        .split("\n\n[Event ")
        .map(|chunk| {
            if chunk.starts_with("[Event ") {
                chunk.to_string()
            } else {
                format!("[Event {}", chunk)
            }
        })
        .collect();

    let mut games = Vec::new();

    for chunk in &chunks {
        if !chunk.contains("[Event ") {
            continue;
        }

        let separator = chunk.find("\n\n");
        let (tag_block, move_block) = match separator {
            Some(idx) => (&chunk[..idx], &chunk[idx + 2..]),
            None => (chunk.as_str(), ""),
        };

        let _event = parse_tag(tag_block, "Event");
        let _white = parse_tag(tag_block, "White");
        let _black = parse_tag(tag_block, "Black");
        let _result = parse_tag(tag_block, "Result");
        let moves_san = parse_moves(move_block);

        games.push(ParsedGame { moves_san });
    }

    games
}

fn run_parse_benchmark(games: &[ParsedGame]) -> (usize, usize) {
    let mut total_moves = 0usize;
    let mut invalid_games = 0usize;

    for game in games {
        if game.moves_san.is_empty() {
            invalid_games += 1;
            continue;
        }
        total_moves += game.moves_san.len();
    }

    (total_moves, invalid_games)
}

fn run_replay_benchmark(games: &[ParsedGame]) -> (usize, usize) {
    let mut total_moves = 0usize;
    let mut invalid_games = 0usize;

    for game in games {
        if game.moves_san.is_empty() {
            invalid_games += 1;
            continue;
        }

        let mut position = Chess::default();
        let mut applied_any = false;

        for san_text in &game.moves_san {
            let san = match san_text.parse::<San>() {
                Ok(parsed) => parsed,
                Err(_) => continue,
            };

            let chess_move = match san.to_move(&position) {
                Ok(chess_move) => chess_move,
                Err(_) => continue,
            };

            position.play_unchecked(&chess_move);
            total_moves += 1;
            applied_any = true;
        }

        if !applied_any {
            invalid_games += 1;
        }
    }

    (total_moves, invalid_games)
}

fn format_duration(seconds: f64) -> String {
    let safe_seconds = if seconds.is_finite() && seconds >= 0.0 {
        seconds
    } else {
        0.0
    };

    if safe_seconds < 0.001 {
        let microseconds = (safe_seconds * 1_000_000.0).round().max(1.0);
        return format!("{microseconds:.0}µs");
    }

    if safe_seconds < 1.0 {
        return format!("{:.3}ms", safe_seconds * 1000.0);
    }

    format!("{safe_seconds:.3}s")
}

fn format_number_with_commas(integer_text: &str) -> String {
    let mut out = String::with_capacity(integer_text.len() + (integer_text.len() / 3));
    for (index, ch) in integer_text.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn format_mps(value: f64) -> String {
    let safe = if value.is_finite() && value >= 0.0 { value } else { 0.0 };
    let text = format!("{safe:.1}");
    let mut parts = text.split('.');
    let integer_part = parts.next().unwrap_or("0");
    let decimal_part = parts.next().unwrap_or("0");
    format!("{}.{}", format_number_with_commas(integer_part), decimal_part)
}

fn main() {
    let args = parse_args(&env::args().skip(1).collect::<Vec<_>>());
    if args.help {
        print_help();
        return;
    }

    let repo_root = match find_repo_root() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("bench:rust failed: {error}");
            std::process::exit(1);
        }
    };

    let dataset_path = resolve_dataset_path(&repo_root, &args.dataset);
    let dataset_text = match fs::read_to_string(&dataset_path) {
        Ok(text) => text,
        Err(error) => {
            eprintln!(
                "bench:rust failed: unable to read PGN dataset '{}': {error}",
                dataset_path.display()
            );
            std::process::exit(1);
        }
    };

    let parse_started_at = Instant::now();
    let mut games = split_games(&dataset_text);
    if args.limit > 0 && args.limit < games.len() {
        games.truncate(args.limit);
    }

    if games.is_empty() {
        eprintln!("bench:rust failed: no games found in dataset '{}'.", dataset_path.display());
        std::process::exit(1);
    }

    let run_started_at = Instant::now();
    let (total_moves, invalid_games) = match args.mode.as_str() {
        "parse" => run_parse_benchmark(&games),
        "replay" => run_replay_benchmark(&games),
        _ => {
            eprintln!(
                "bench:rust failed: invalid mode '{}'. Use parse|replay.",
                args.mode
            );
            std::process::exit(1);
        }
    };

    let run_seconds = run_started_at.elapsed().as_secs_f64();
    let total_seconds = parse_started_at.elapsed().as_secs_f64();
    let moves_per_second = if run_seconds > 0.0 {
        total_moves as f64 / run_seconds
    } else {
        0.0
    };

    println!("Dataset: {}", dataset_path.display());
    println!("Mode: {}", args.mode);
    println!("Games: {}", games.len());
    println!("Moves: {}", total_moves);
    println!("Invalid games: {}", invalid_games);
    println!("Benchmark time: {}", format_duration(run_seconds));
    println!("Moves/sec: {}", format_mps(moves_per_second));
    println!("Total CLI time: {}", format_duration(total_seconds));
}
