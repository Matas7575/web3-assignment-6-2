import { NextApiResponse } from "next";
import { Game } from "./types";
import {
  ALL_CATEGORIES,
  calculateScore,
  initializeYahtzeeState,
} from "./utils";

export const handleJoin = (
  game: Game,
  username: string,
  res: NextApiResponse
) => {
  if (game.players.includes(username)) {
    return res.status(400).json({ error: "User already in the game" });
  }

  game.players.push(username);
  game.ready = game.players.length >= 2;
  console.log(`${username} joined game ${game.id}`);

  if (global._io) {
    global._io.to(game.id).emit("gameUpdate", { type: "update", game });
    global._io.emit("gameUpdate", { type: "update", game });
  }

  return res.status(200).json(game);
};

export const handleStart = (
  game: Game,
  username: string,
  res: NextApiResponse
) => {
  if (game.host !== username) {
    return res.status(403).json({ error: "Only the host can start the game" });
  }

  if (game.players.length < 2) {
    return res.status(400).json({
      error: "At least 2 players are required to start the game",
    });
  }

  if (game.started) {
    return res.status(400).json({ error: "Game has already started" });
  }

  game.started = true;
  game.yahtzeeState = initializeYahtzeeState(game.players);

  if (global._io) {
    global._io.to(game.id).emit("gameUpdate", { type: "update", game });
  }

  return res.status(200).json(game);
};

export const handleRollDice = (
  game: Game,
  username: string,
  res: NextApiResponse
) => {
  if (!game.started || !game.yahtzeeState) {
    return res.status(400).json({ error: "Game has not started yet" });
  }

  if (game.yahtzeeState.currentPlayer !== username) {
    return res.status(403).json({ error: "Not your turn!" });
  }

  if (game.yahtzeeState.rollsLeft <= 0) {
    return res.status(400).json({ error: "No rolls left!" });
  }

  game.yahtzeeState.dice = game.yahtzeeState.dice.map((die, index) =>
    game.yahtzeeState!.heldDice[index] ? die : Math.ceil(Math.random() * 6)
  );

  game.yahtzeeState.rollsLeft -= 1;

  if (global._io) {
    global._io.to(game.id).emit("gameUpdate", { type: "update", game });
  }

  return res.status(200).json(game);
};

export const handleHoldDice = (
  game: Game,
  username: string,
  diceIndexes: any,
  res: NextApiResponse
) => {
  if (!game.started || !game.yahtzeeState) {
    return res.status(400).json({ error: "Game has not started yet" });
  }

  if (game.yahtzeeState.currentPlayer !== username) {
    return res.status(403).json({ error: "Not your turn!" });
  }

  if (
    !Array.isArray(diceIndexes) ||
    !diceIndexes.every(
      (index: any) => typeof index === "number" && index >= 0 && index < 5
    )
  ) {
    return res.status(400).json({
      error: "diceIndexes must be an array of numbers between 0 and 4",
    });
  }

  diceIndexes.forEach((index: number) => {
    game.yahtzeeState!.heldDice[index] = !game.yahtzeeState!.heldDice[index];
  });

  if (global._io) {
    global._io.to(game.id).emit("gameUpdate", { type: "update", game });
  }

  return res.status(200).json(game);
};

export const handleScoreCategory = (
  game: Game,
  username: string,
  category: any,
  res: NextApiResponse
) => {
  if (!game.started || !game.yahtzeeState) {
    return res.status(400).json({ error: "Game has not started yet" });
  }

  if (game.yahtzeeState.currentPlayer !== username) {
    return res.status(403).json({ error: "Not your turn!" });
  }

  if (typeof category !== "string" || category.trim() === "") {
    return res.status(400).json({
      error: "category is required and must be a non-empty string",
    });
  }

  if (!ALL_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  if (!game.yahtzeeState.scores[username]) {
    game.yahtzeeState.scores[username] = { total: 0 };
  }

  if (game.yahtzeeState.scores[username][category] !== undefined) {
    return res.status(400).json({ error: "Category already scored!" });
  }

  const score = calculateScore(category, game.yahtzeeState.dice);
  game.yahtzeeState.scores[username][category] = score;

  const totalScore = Object.entries(game.yahtzeeState.scores[username])
    .filter(([cat]) => cat !== "total")
    .reduce((sum, [_, catScore]) => sum + (catScore || 0), 0);
  game.yahtzeeState.scores[username].total = totalScore;

  game.yahtzeeState.rollsLeft = 3;
  game.yahtzeeState.dice = [0, 0, 0, 0, 0];
  game.yahtzeeState.heldDice = [false, false, false, false, false];

  const currentIndex = game.players.indexOf(game.yahtzeeState.currentPlayer);
  game.yahtzeeState.currentPlayer =
    game.players[(currentIndex + 1) % game.players.length];

  const allPlayersScored = game.players.every((player) => {
    const playerScores = game.yahtzeeState!.scores[player];
    return ALL_CATEGORIES.every((cat) => playerScores[cat] !== undefined);
  });

  if (allPlayersScored) {
    game.yahtzeeState.gameOver = true;
  }

  if (global._io) {
    global._io.to(game.id).emit("gameUpdate", { type: "update", game });
  }

  return res.status(200).json(game);
};
