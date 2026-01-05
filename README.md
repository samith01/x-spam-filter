# X Spam Filter - Chrome Extension

A lightweight Chrome extension that hides low-engagement spam replies on X (Twitter) using pure client-side pattern matching. No API calls, no AI detection, just smart rules.

## Features

- 🛡️ **Auto-runs** on x.com and twitter.com
- 📏 **Pattern Matching Rules:**
  - Short replies (< 15 words)
  - Hashtag spam (> 20% hashtags)
  - Generic replies (no personal pronouns)
  - Empty praise + emoji spam
- �� **Daily counter** tracks hidden spam
- 🔽 **Click to reveal** hidden replies
- ⚙️ **Adjustable sensitivity** (Low/Medium/High)
- 🌙 **Dark mode support**

## Installation

1. **Clone or download** this repository

2. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `aiFilter` folder

3. **Done!** The extension is now active on X/Twitter.

## How It Works

### Spam Detection Rules

Each reply is scored based on these patterns:

| Rule | Points | Description |
|------|--------|-------------|
| Short text | +1 | Less than 15 words |
| Hashtag spam | +1 | More than 20% of words are hashtags |
| No pronouns | +1 | Missing personal words (I, you, my, we, etc.) |
| Generic praise | +1 | Words like "amazing", "great" + 3+ emojis |
| Emoji spam | +0.5 | 5 or more emojis |
| Short praise | +0.5 | Very short (≤5 words) with praise words |

### Sensitivity Levels

- **Low:** Only obvious spam (hashtag spam, very short + high score)
- **Medium:** Score ≥ 2 points → Hide
- **High:** Score ≥ 1.5 points → Hide

## Files

```
aiFilter/
├── manifest.json     # Extension configuration
├── content.js        # Main spam detection logic
├── popup.html        # Settings popup UI
├── popup.js          # Popup functionality
├── styles.css        # Styling for hidden replies & spam bar
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md         # This file
```

## Usage

1. **Automatic:** Extension runs automatically when you visit X/Twitter
2. **Toggle:** Click extension icon → Toggle ON/OFF
3. **Sensitivity:** Adjust slider for more/less aggressive filtering
4. **View Hidden:** Click the grey "🔽 X spam replies hidden" bar to reveal
5. **Reset:** Click "Reset Counter" to clear daily stats

## Privacy

- ✅ **100% client-side** - No data leaves your browser
- ✅ **No API calls** - Pure JavaScript pattern matching
- ✅ **No tracking** - Only stores your settings locally

## Permissions

- `activeTab` - To run on X/Twitter pages
- `storage` - To save your settings locally

# x-spam-filter
