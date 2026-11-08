# Skidmore Faceoff Tracker

Log Skidmore hockey faceoffs live, see results by zone and by opposing player, and copy the key findings into a text to the coach at intermission.

## Before a game

1. While you have internet, open the app once on the laptop you'll use. It then works at the rink without Wi-Fi.
2. Check the roster under **Games and roster**. Centers ticked there appear first when logging.
3. Click **Start a game** and enter the opponent.
4. Check the rink captions. If Skidmore starts at the other end, click **Flip rink**. The rink then flips by itself at each period change.
5. Optional: type the opposing centers' numbers into **New number**, pressing Return after each. They stay as buttons for that game. To remove a mistake, click the number, then **Remove**. Numbers with a faceoff logged can't be removed.

## Logging a faceoff

1. Click the circle on the rink.
2. Click the Skidmore player's number.
3. Click the opposing number, or type a new one and press Return.
4. Click who won.

The entry area flashes green for a Skidmore win and red for a loss. Click **Undo** beside the message to remove the latest faceoff, or click any recent faceoff to edit or delete it. Press Esc or **Clear** to start an entry over.

### Keyboard

| Step | Keys |
|---|---|
| Rink circle | `Q` `W` `E` `R` top row, `D` center ice, `Z` `X` `C` `V` bottom row. The letter beside each circle shows its key. |
| Skidmore player | Type the jersey number |
| Opposing player | Type the number, then press Return |
| Who won | `J` Skidmore, `K` opponent |
| Undo last | `U` |
| Clear the entry | `Esc` |

### Period and rink direction

**Now playing** above the rink sets the period and which way the rink faces, so change it at each intermission. After 8 minutes without a faceoff, the app asks whether the period has changed and won't save the next faceoff until you answer.

If you do log under the wrong period, click **Fix period mistake** beside Recent faceoffs. It moves the latest faceoffs to the right period and, if the rink was backwards, corrects their zones.

## Reading the stats

- **Live stats** stay beside the rink and update after every faceoff. Use **Game, This period, P1, P2, P3, OT** to change what they show. A note appears if you're viewing a different period from the one you're logging.
- **Records are always from Skidmore's side.** Against their #9, 3-1 means Skidmore won 3 of 4.
- **Zones:** zone 1 is left of the goal, facing that goal. All neutral circles count as one neutral zone.
- **Colors:** green is 55% or better and red is 45% or worse, once there are at least 4 draws. Under 4 draws the percentage is muted.
- **Full stats** has the complete table, the opponent grid and season totals.

## Texting the coach

Click **Coach message**, edit the draft if you want, then click **Copy message** and paste it into your text. It covers the whole game unless you choose a single period in the dialog.

The message leaves out each player's overall record, because the coach already has those. It shows:

- the team's Defense, Offense and Neutral records, with the best and worst player in each
- the strongest and weakest players at a single circle
- the best and worst individual matchups

A player needs at least 3 draws in that zone or matchup to be named. Best means a winning record and worst means a losing one.

## Keeping your data

Game data is saved only in the browser on your laptop. It isn't sent anywhere or stored in this repo. Clearing browser data erases it, and it won't appear in another browser or on another computer, so download a backup after each game from **Games and roster**, which also shows when you last did.

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
