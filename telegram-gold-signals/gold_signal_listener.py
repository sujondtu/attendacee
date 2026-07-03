#!/usr/bin/env python3
"""
Telegram Gold Signal Listener
=============================

Logs in to YOUR Telegram account (via Telethon), watches the signal
groups/channels you are a member of, and when a message looks like a
GOLD / XAUUSD trading signal it fires loud alerts so you never miss it:

  1. Forwards the signal to a chat of your choice (e.g. a private
     "Gold Alerts" channel where you set a loud custom ringtone).
  2. Optional: sends an URGENT push via ntfy.sh (rings through silent mode
     when configured in the ntfy app).
  3. Optional: sends an EMERGENCY push via Pushover (repeats until you
     acknowledge it).
  4. Optional: triggers a real Telegram voice CALL via CallMeBot.

All settings live in config.ini (copy config.example.ini to start).

First run is interactive: you will be asked for your phone number and the
login code Telegram sends you. After that a .session file keeps you logged in.

Usage:
    python gold_signal_listener.py           # run the listener
    python gold_signal_listener.py --test    # send one test alert and exit
"""

import argparse
import asyncio
import configparser
import hashlib
import logging
import re
import sys
import time
from pathlib import Path

try:
    import aiohttp
    from telethon import TelegramClient, events
except ImportError:
    sys.exit(
        "Missing dependencies. Run:\n"
        "    pip install -r requirements.txt"
    )

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.ini"
SESSION_FILE = BASE_DIR / "gold_signals"  # Telethon adds .session

log = logging.getLogger("gold-signals")

# Alerts for identical text within this window are considered duplicates
# (signal groups often cross-post the same message).
DEDUP_WINDOW_SECONDS = 6 * 60 * 60


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

def load_config() -> configparser.ConfigParser:
    if not CONFIG_FILE.exists():
        sys.exit(
            f"Config file not found: {CONFIG_FILE}\n"
            "Copy config.example.ini to config.ini and fill in your values."
        )
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_FILE, encoding="utf-8")

    api_id = cfg.get("telegram", "api_id", fallback="").strip()
    api_hash = cfg.get("telegram", "api_hash", fallback="").strip()
    if not api_id.isdigit() or not api_hash:
        sys.exit(
            "Please set api_id (numbers only) and api_hash in config.ini.\n"
            "Get them free at https://my.telegram.org -> API development tools."
        )
    return cfg


def csv_list(raw: str) -> list[str]:
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


# --------------------------------------------------------------------------
# Signal detection
# --------------------------------------------------------------------------

class SignalFilter:
    def __init__(self, cfg: configparser.ConfigParser):
        gold_words = csv_list(
            cfg.get("filter", "gold_keywords",
                    fallback="gold, xauusd, xau/usd, xau")
        )
        action_words = csv_list(
            cfg.get("filter", "action_keywords",
                    fallback="buy, sell, long, short, entry, tp, sl, "
                             "take profit, stop loss, target")
        )
        self.require_action = cfg.getboolean(
            "filter", "require_action_word", fallback=True
        )
        self.gold_re = self._compile(gold_words)
        self.action_re = self._compile(action_words)
        self._seen: dict[str, float] = {}

    @staticmethod
    def _compile(words: list[str]) -> re.Pattern:
        # Word-boundary match so "gold" doesn't fire on "golden" and
        # "sl" doesn't fire inside "signals".
        parts = [r"\b" + re.escape(w).replace(r"\ ", r"\s+") + r"\b"
                 for w in words]
        return re.compile("|".join(parts) or r"(?!x)x", re.IGNORECASE)

    def is_gold_signal(self, text: str) -> bool:
        if not text or not self.gold_re.search(text):
            return False
        if self.require_action and not self.action_re.search(text):
            return False
        return True

    def is_duplicate(self, text: str) -> bool:
        """True if the same text already triggered an alert recently."""
        key = hashlib.sha1(
            re.sub(r"\s+", " ", text.strip().lower()).encode()
        ).hexdigest()
        now = time.time()
        # purge old entries
        for k, ts in list(self._seen.items()):
            if now - ts > DEDUP_WINDOW_SECONDS:
                del self._seen[k]
        if key in self._seen:
            return True
        self._seen[key] = now
        return False


# --------------------------------------------------------------------------
# Alert channels
# --------------------------------------------------------------------------

class Alerter:
    def __init__(self, cfg: configparser.ConfigParser, client: TelegramClient):
        self.cfg = cfg
        self.client = client
        self.forward_to = cfg.get("telegram", "forward_to", fallback="me").strip() or "me"

    async def send_all(self, text: str, source_name: str, message=None):
        """Fire every enabled alert channel. Failures in one channel
        must not stop the others."""
        results = await asyncio.gather(
            self._telegram_forward(text, source_name, message),
            self._ntfy(text, source_name),
            self._pushover(text, source_name),
            self._callmebot(source_name),
            return_exceptions=True,
        )
        for name, result in zip(("telegram", "ntfy", "pushover", "callmebot"),
                                results):
            if isinstance(result, Exception):
                log.error("Alert channel '%s' failed: %s", name, result)

    async def _telegram_forward(self, text: str, source_name: str, message):
        target = await self.client.get_entity(self.forward_to)
        header = f"🥇🚨 GOLD SIGNAL — from {source_name}"
        if message is not None:
            await self.client.send_message(target, header)
            try:
                await self.client.forward_messages(target, message)
                return
            except Exception:
                # Group may have "protected content" (no forwarding) —
                # fall back to copying the text.
                pass
        await self.client.send_message(target, f"{header}\n\n{text}")

    async def _ntfy(self, text: str, source_name: str):
        if not self.cfg.getboolean("ntfy", "enabled", fallback=False):
            return
        server = self.cfg.get("ntfy", "server", fallback="https://ntfy.sh").strip().rstrip("/")
        topic = self.cfg.get("ntfy", "topic", fallback="").strip()
        if not topic:
            log.warning("ntfy enabled but no topic set")
            return
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{server}/{topic}",
                data=text.encode("utf-8"),
                headers={
                    "Title": f"GOLD SIGNAL - {source_name}",
                    "Priority": "urgent",   # max priority -> can override DND
                    "Tags": "rotating_light,moneybag",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                resp.raise_for_status()

    async def _pushover(self, text: str, source_name: str):
        if not self.cfg.getboolean("pushover", "enabled", fallback=False):
            return
        user_key = self.cfg.get("pushover", "user_key", fallback="").strip()
        app_token = self.cfg.get("pushover", "app_token", fallback="").strip()
        if not (user_key and app_token):
            log.warning("pushover enabled but user_key/app_token missing")
            return
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.pushover.net/1/messages.json",
                data={
                    "token": app_token,
                    "user": user_key,
                    "title": f"GOLD SIGNAL - {source_name}",
                    "message": text[:1024],
                    "priority": 2,      # emergency: repeats until acknowledged
                    "retry": 30,        # every 30s
                    "expire": 600,      # for up to 10 minutes
                    "sound": "persistent",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                resp.raise_for_status()

    async def _callmebot(self, source_name: str):
        if not self.cfg.getboolean("callmebot", "enabled", fallback=False):
            return
        username = self.cfg.get("callmebot", "telegram_username", fallback="").strip()
        if not username:
            log.warning("callmebot enabled but telegram_username missing")
            return
        if not username.startswith("@"):
            username = "@" + username
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.callmebot.com/start.php",
                params={
                    "user": username,
                    "text": f"New gold signal from {source_name}. "
                            "Check your Telegram now.",
                    "lang": "en-US-Standard-B",
                },
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                resp.raise_for_status()


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

async def run(test_mode: bool):
    cfg = load_config()
    sig_filter = SignalFilter(cfg)
    watch_chats = set(csv_list(cfg.get("telegram", "watch_chats", fallback="")))

    client = TelegramClient(
        str(SESSION_FILE),
        int(cfg.get("telegram", "api_id")),
        cfg.get("telegram", "api_hash"),
    )
    await client.start()  # interactive phone + code on the very first run
    me = await client.get_me()
    log.info("Logged in as %s (id=%s)", me.first_name, me.id)

    alerter = Alerter(cfg, client)

    if test_mode:
        log.info("Sending TEST alert through all enabled channels...")
        await alerter.send_all(
            "TEST ALERT ✅\n"
            "GOLD (XAUUSD) BUY 3350 / TP 3360 / SL 3340\n"
            "If you can see/hear this loudly, your setup works!",
            "gold-signal-listener self-test",
        )
        log.info("Test alert sent. Exiting.")
        return

    def chat_matches(chat, chat_id: int) -> bool:
        if not watch_chats:
            return True
        candidates = {str(chat_id).lower()}
        username = getattr(chat, "username", None)
        if username:
            candidates.add(username.lower())
            candidates.add("@" + username.lower())
        title = getattr(chat, "title", None)
        if title:
            candidates.add(title.lower())
        return bool(candidates & watch_chats)

    @client.on(events.NewMessage())
    async def handler(event):
        # Only groups/channels — private chats and bots are ignored.
        if not (event.is_group or event.is_channel):
            return
        text = event.raw_text or ""
        if not sig_filter.is_gold_signal(text):
            return
        chat = await event.get_chat()
        if not chat_matches(chat, event.chat_id):
            return
        source_name = getattr(chat, "title", None) or str(event.chat_id)
        if sig_filter.is_duplicate(text):
            log.info("Duplicate signal from '%s' ignored.", source_name)
            return
        log.info("GOLD signal detected in '%s' — sending alerts.", source_name)
        await alerter.send_all(text, source_name, message=event.message)

    if watch_chats:
        log.info("Watching only these chats: %s", ", ".join(sorted(watch_chats)))
    else:
        log.info("Watching ALL groups and channels you are a member of.")
    log.info("Listener is running. Press Ctrl+C to stop.")
    await client.run_until_disconnected()


def main():
    parser = argparse.ArgumentParser(description="Telegram gold signal listener")
    parser.add_argument("--test", action="store_true",
                        help="send one test alert through all enabled "
                             "channels, then exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    try:
        asyncio.run(run(args.test))
    except KeyboardInterrupt:
        log.info("Stopped by user.")


if __name__ == "__main__":
    main()
