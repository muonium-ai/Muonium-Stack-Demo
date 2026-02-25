use regex::Regex;
use serde::Serialize;
use shakmaty::EnPassantMode;
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::{Chess, Position};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize)]
struct GameMeta {
    id: usize,
    event: String,
    white: String,
    black: String,
    result: String,
    moves: usize,
}

#[derive(Debug, Clone, Serialize)]
struct ReplayData {
    id: usize,
    moves_san: Vec<String>,
    fens: Vec<String>,
}

#[derive(Debug, Clone)]
struct ParsedGame {
    event: String,
    white: String,
    black: String,
    result: String,
    moves_san: Vec<String>,
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

        let event = parse_tag(tag_block, "Event");
        let white = parse_tag(tag_block, "White");
        let black = parse_tag(tag_block, "Black");
        let result = parse_tag(tag_block, "Result");
        let moves_san = parse_moves(move_block);

        games.push(ParsedGame {
            event,
            white,
            black,
            result,
            moves_san,
        });
    }

    games
}

fn build_fens(moves_san: &[String]) -> Vec<String> {
    let mut position = Chess::default();
    let mut fens = vec![Fen::from_position(position.clone(), EnPassantMode::Legal).to_string()];

    for san_text in moves_san {
        let san = match san_text.parse::<San>() {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        let chess_move = match san.to_move(&position) {
            Ok(chess_move) => chess_move,
            Err(_) => continue,
        };

        position.play_unchecked(&chess_move);
        fens.push(Fen::from_position(position.clone(), EnPassantMode::Legal).to_string());
    }

    fens
}

#[wasm_bindgen]
pub fn list_games(pgn_text: &str) -> String {
    let parsed = split_games(pgn_text);
    let list: Vec<GameMeta> = parsed
        .iter()
        .enumerate()
        .map(|(index, game)| GameMeta {
            id: index,
            event: game.event.clone(),
            white: game.white.clone(),
            black: game.black.clone(),
            result: game.result.clone(),
            moves: game.moves_san.len(),
        })
        .collect();

    serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn game_positions_json(pgn_text: &str, game_index: usize) -> String {
    let parsed = split_games(pgn_text);
    let Some(game) = parsed.get(game_index) else {
        return "{}".to_string();
    };

    let fens = build_fens(&game.moves_san);
    let replay = ReplayData {
        id: game_index,
        moves_san: game.moves_san.clone(),
        fens,
    };

    serde_json::to_string(&replay).unwrap_or_else(|_| "{}".to_string())
}
