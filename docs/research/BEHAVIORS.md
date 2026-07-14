# Behaviors

- Start opens setup and first-visit tutorial choice.
- Nickname must be 1–12 characters before Game Start is enabled.
- Difficulty changes monster strength; Hard also applies wrong-answer penalty.
- Desktop movement: arrows or WASD. Mobile movement: drag on-screen joystick.
- Attacks are automatic; defeated monsters drop XP gems.
- Level-up pauses play and opens a timed multiple-choice math quiz.
- Correct answer grants/levels a weapon and gives a speed bonus; wrong/timeout shows explanation and resumes without an upgrade.
- Background tab visibility pauses the game.
- Stop requires confirmation, then stores the score locally.
- Ranking uses `localStorage` fallback because the public build has no configured Firebase values; no original backend is reused.
