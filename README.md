# 🎵 HiChord Web Uploader

Simple, beautiful web interface for uploading firmware and bootloader to HiChord devices.

## 🚀 Quick Start

**Visit:** [Your GitHub Pages URL will be here]

### For New Daisy Seed Users:
1. Click "🆕 New Daisy Seed"
2. Follow the visual instructions to install bootloader
3. Then upload firmware

### For Existing HiChord Users:
1. Click "🎹 HiChord Device"
2. Hold Fn1+Fn2+Fn3 for 5 seconds
3. Upload firmware

## 📦 What's Included

- `index.html` - Web uploader interface
- `boot/dsy_bootloader_v6_2-extdfu-10ms.bin` - Daisy bootloader (121 KB)
- `firmware/hichord_unified.bin` - HiChord firmware (1.1 MB)

## 🌐 GitHub Pages Setup

1. **Enable GitHub Pages:**
   - Go to repo Settings → Pages
   - Source: Deploy from branch → `main`
   - Save

2. **Access your uploader:**
   - URL: `https://YOUR_USERNAME.github.io/hichord-uploader/`
   - Share with users!

## ⚡ Features

- **Pedagogically Clear:** Step-by-step wizard interface
- **Fast Upload:** Optimized 10ms delays (2x faster than before)
- **Auto-Fetch:** Binary files load automatically from GitHub
- **Two Paths:** Separate flows for new Daisy Seeds vs existing HiChords
- **Visual Progress:** Real-time progress bar and status messages
- **No File Upload Needed:** Everything fetches from this repo

## 🔧 Technical Details

### Upload Speeds:
- Bootloader: ~5-10 seconds
- Firmware: ~60-120 seconds (optimized from 2-5 minutes)

### Browser Requirements:
- Chrome or Edge (WebUSB support required)
- Not supported: Firefox, Safari

### DFU Mode Entry:

**For Bootloader (New Daisy Seed):**
- Hold BOOT + Press RESET + Release both

**For Firmware (HiChord):**
- Hold Fn1+Fn2+Fn3 for 5 seconds
- OR: Press RESET then BOOT within 2s

## 📱 Mobile Support

Currently desktop-only (WebUSB not available on mobile browsers).

## 🔒 Privacy

This repo is private. Only authorized users with the GitHub Pages link can access the uploader.

## 📝 License

Proprietary - HiChord Project

---

Built with ❤️ for the HiChord community
