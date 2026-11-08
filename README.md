# Skidmore Faceoff Tracker

Log Skidmore hockey faceoffs live, see results by zone and by opposing player, and copy the key findings into a text to the coach at intermission.

## Before a game

1. While you have internet, open the app once on the laptop you'll use. It then works at the rink without Wi-Fi.
2. Check the roster under **Games and roster**. Centers ticked there appear first when logging.
3. Click **Start a game** and enter the opponent.
4. Check the rink captions. If Skidmore starts at the other end, click **Flip rink**. The rink then flips by itself at each period change.

## Logging a faceoff

1. Click the circle on the rink.
2. Click the Skidmore player's number.
3. Click the opposing number, or type a new one and press Return.
4. Click who won.

Click **Undo last** to remove the latest faceoff, or click any recent faceoff to edit or delete it. Press Esc or **Clear** to start an entry over.

Remember to change the **Period** at the top of the screen. It controls the rink direction and how faceoffs are filtered.

## Reading the stats

- **Live stats** stay beside the rink and update after every faceoff. Use **Game, P1, P2, P3, OT** to change what they show.
- **Records are always from Skidmore's side.** Against their #9, 3-1 means Skidmore won 3 of 4.
- **Zones:** zone 1 is left of the goal, facing that goal. All neutral circles count as one neutral zone.
- **Colors:** green is 55% or better and red is 45% or worse, once there are at least 4 draws. Under 4 draws the percentage is muted.
- **Full stats** has the complete table, the opponent grid and season totals.

## Texting the coach

Click **Text the coach**, edit the draft if you want, then click **Copy message** and paste it into your text. It follows the Game or period filter you have selected in Live stats.

## Keeping your data

Game data is saved only in the browser on your laptop. It isn't sent anywhere or stored in this repo. Clearing browser data erases it, and it won't appear in another browser or on another computer, so download a backup after each game from **Games and roster**.

## Development

No build step or dependencies. Serve the folder locally, then open http://localhost:4173:

```bash
python3 -m http.server 4173
```

Run the tests:

```bash
node --test
```

`js/stats.js` holds all the stat logic, `js/store.js` handles saving and exports, `js/seed.js` holds the roster and games 1 and 2, and `js/app.js` is the interface. If you add a file the app needs, also add it to the list in `sw.js`.
