# 🥇 Telegram Gold Signal Listener

Watches the Telegram signal groups you are a member of — **even muted
ones** — and rings your phone loudly whenever a GOLD / XAUUSD trading
signal is posted, so you never miss an entry again.

How it works:

```
Signal group posts "GOLD BUY 3350 TP 3360 SL 3340"
        │
        ▼
This script (running 24/7 on a VPS / Raspberry Pi / old PC)
detects gold keywords + buy/sell keywords
        │
        ├─► Forwards it to your private "Gold Alerts" channel
        │   (which you gave a LOUD custom ringtone)
        ├─► Optional: urgent ntfy push (rings through silent mode)
        ├─► Optional: Pushover emergency alert (repeats until you tap it)
        └─► Optional: CallMeBot voice CALL to your Telegram
```

---

## Step 1 — Get your Telegram API keys (free, 2 minutes)

1. Open https://my.telegram.org and log in with your phone number.
2. Click **API development tools**.
3. Fill in any app name (e.g. "gold-signals") and create it.
4. Copy the **api_id** (numbers) and **api_hash** (long text).

⚠️ These keys plus the `.session` file created later give **full access
to your Telegram account**. Keep them secret, never share them, and never
commit `config.ini` or `*.session` to GitHub (the included `.gitignore`
already blocks this).

## Step 2 — Install

You need a machine that stays on 24/7: a cheap VPS (~$4/month, e.g.
Hetzner/DigitalOcean), a Raspberry Pi, or an old PC. Python 3.9+ required.

```bash
# copy this folder to the machine, then inside it:
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp config.example.ini config.ini
nano config.ini                 # paste your api_id and api_hash
```

## Step 3 — First login

```bash
python gold_signal_listener.py
```

The first time, it asks for your **phone number** and the **login code**
Telegram sends you (and your 2FA password if you have one). After that it
stays logged in via the `gold_signals.session` file and starts listening.

## Step 4 — Make the alert LOUD 📢 (the important part)

The script forwards signals to the chat set in `forward_to`. Recommended
setup:

1. In Telegram, create a **new private channel** called e.g. "🥇 Gold Alerts"
   (just you in it).
2. Set `forward_to = @YourChannelUsername` in `config.ini` (give the
   channel a username, or use its numeric id).
3. On your phone: open that channel → its name → **Notifications** →
   enable, and upload a **loud alarm sound** as the custom notification
   sound. Also set vibration to max.
4. Exclude Telegram from battery optimization on Android
   (Settings → Apps → Telegram → Battery → Unrestricted), otherwise
   Android may delay notifications.

Want it even more aggressive? Enable one of these in `config.ini`:

| Option | Cost | What you get |
|---|---|---|
| **ntfy** | free | Push that can override silent mode / Do Not Disturb (set "Instant delivery" + DND override for your topic in the ntfy app) |
| **Pushover** | ~$5 once | Emergency alert that re-rings every 30 s until you acknowledge it |
| **CallMeBot** | free | An actual Telegram **voice call** on every signal |

## Step 5 — Test it

```bash
python gold_signal_listener.py --test
```

This sends one fake gold signal through every enabled alert channel.
If your phone rings loudly — you're done. If not, fix the notification
settings from Step 4 and test again.

You can also post `GOLD BUY 3350 TP 3360 SL 3340` in any test group you
own (the listener only watches groups/channels, not private chats).

## Step 6 — Keep it running 24/7

**Linux VPS / Raspberry Pi (recommended):** use the included systemd
service — see the comments inside `gold-signals.service`. It auto-starts
on boot and auto-restarts on crashes.

**Quick and dirty:** `nohup python gold_signal_listener.py &` or run it
inside `screen`/`tmux`.

**Old Android phone:** install Termux, then `pkg install python`, and
follow Step 2 inside Termux. Keep the phone plugged in with battery
optimization off for Termux.

## Configuration tips

- `watch_chats` empty = watch **all** your groups/channels. To reduce
  noise, list only your signal groups:
  `watch_chats = @GoldVIPSignals, Forex Kings`
- `require_action_word = true` means a message must contain both a gold
  word (gold/xauusd) **and** an action word (buy/sell/tp/sl/...). This
  stops casual chat like "gold is moving today" from ringing your phone.
  Set it to `false` if your group posts signals as images with short
  captions.
- Identical messages posted in several groups within 6 hours only alert
  once (duplicate protection).
- **Limitation:** signals posted as *images with no caption text* cannot
  be detected, since there is no text to match.

## ⚠️ Honest risk warning

This tool makes sure you *see* signals instantly — it cannot make the
signals *good*. Many paid signal groups are scams or post entries after
the move already happened. Track a group's real win rate on a demo
account before risking money, never risk more than you can afford to
lose, and always use the stop loss. Also note that automating a user
account ("userbot") is tolerated by Telegram for personal use like this,
but spammy use can get an account limited — this script only reads and
forwards to yourself, which is the safe end of that spectrum.
