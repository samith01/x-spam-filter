// X Spam Filter - Client-side pattern matching spam detection
// No API calls, pure JavaScript rules

(() => {
  'use strict';

  // Configuration
  const CONFIG = {
    personalPronouns: ['i', 'you', 'your', 'my', 'we', 'me', 'our', 'us', 'myself', 'yourself'],
    genericPraiseWords: ['great', 'amazing', 'love', 'brilliant', 'incredible', 'awesome', 'fantastic', 'wonderful', 'perfect', 'excellent'],
    emojiRegex: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu
  };

  // State
  let state = {
    enabled: true,
    sensitivity: 'medium', // low, medium, high
    hiddenToday: 0,
    hiddenInThread: 0,
    processedTweets: new WeakSet(),
    hiddenTweets: new Set(),
    countedTweetIds: new Set(), // Track unique tweet IDs to avoid double-counting
    spamBar: null,
    lastDate: new Date().toDateString(),
    mainTweetAuthor: null, // Store the main tweet author's username
    spamToggle: null, // Toggle switch element
    showSpam: false // Whether spam is currently visible
  };

  // Initialize extension
  async function init() {
    await loadSettings();
    if (state.enabled) {
      startObserver();
      processExistingReplies();
    }
    listenForMessages();
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['enabled', 'sensitivity', 'hiddenToday', 'lastDate', 'countedTweetIds']);
      state.enabled = result.enabled !== false;
      state.sensitivity = result.sensitivity || 'medium';
      state.lastDate = result.lastDate || new Date().toDateString();
      
      // Reset counter if new day
      const today = new Date().toDateString();
      if (state.lastDate !== today) {
        state.hiddenToday = 0;
        state.lastDate = today;
        state.countedTweetIds = new Set();
        await chrome.storage.local.set({ hiddenToday: 0, lastDate: today, countedTweetIds: [] });
      } else {
        state.hiddenToday = result.hiddenToday || 0;
        state.countedTweetIds = new Set(result.countedTweetIds || []);
      }
    } catch (e) {
      console.log('Spam Filter: Using default settings');
    }
  }

  // Listen for messages from popup
  function listenForMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'toggleEnabled') {
        state.enabled = message.enabled;
        if (state.enabled) {
          startObserver();
          processExistingReplies();
        } else {
          resetAllSpamStyles();
        }
      } else if (message.type === 'sensitivityChanged') {
        state.sensitivity = message.sensitivity;
        reprocessAllReplies();
      } else if (message.type === 'getStats') {
        sendResponse({ hiddenToday: state.hiddenToday, hiddenInThread: state.hiddenInThread });
      }
      return true;
    });
  }

  // Spam detection rules
  function analyzeReply(text) {
    const score = {
      total: 0,
      reasons: []
    };

    // Clean text and extract metrics
    const cleanText = text.trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const hashtags = (cleanText.match(/#\w+/g) || []).length;
    const emojis = (cleanText.match(CONFIG.emojiRegex) || []).length;
    const lowerText = cleanText.toLowerCase();
    const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));

    // Rule 1: Text length < 15 words
    if (wordCount < 15) {
      score.total += 1;
      score.reasons.push('short');
    }

    // Rule 2: Hashtag count > 20% of word count
    if (wordCount > 0 && (hashtags / wordCount) > 0.2) {
      score.total += 1;
      score.reasons.push('hashtag-spam');
    }

    // Rule 3: No personal pronouns (generic reply)
    const hasPersonalPronoun = CONFIG.personalPronouns.some(pronoun => 
      lowerWords.includes(pronoun)
    );
    if (!hasPersonalPronoun) {
      score.total += 1;
      score.reasons.push('no-pronouns');
    }

    // Rule 4: Generic praise + emoji spam (3+ emojis)
    const hasPraiseWord = CONFIG.genericPraiseWords.some(word => 
      lowerText.includes(word)
    );
    if (hasPraiseWord && emojis >= 3) {
      score.total += 1;
      score.reasons.push('generic-praise');
    }

    // Rule 5: Extreme emoji spam (5+ emojis alone)
    if (emojis >= 5) {
      score.total += 0.5;
      score.reasons.push('emoji-spam');
    }

    // Rule 6: Very short with only praise words
    if (wordCount <= 5 && hasPraiseWord) {
      score.total += 0.5;
      score.reasons.push('short-praise');
    }

    return score;
  }

  // Determine if reply should be hidden based on sensitivity
  function shouldHide(score) {
    switch (state.sensitivity) {
      case 'low':
        // Only obvious spam: short + hashtag OR hashtag spam alone
        return score.reasons.includes('hashtag-spam') || 
               (score.reasons.includes('short') && score.total >= 2);
      case 'medium':
        // Score >= 2
        return score.total >= 2;
      case 'high':
        // Score >= 1.5
        return score.total >= 1.5;
      default:
        return score.total >= 2;
    }
  }

  // Get the main tweet author's username
  function getMainTweetAuthor() {
    if (state.mainTweetAuthor) return state.mainTweetAuthor;

    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) return null;

    // Find the main tweet
    const mainTweetArticle = primaryColumn.querySelector('article[data-testid="tweet"]');
    if (!mainTweetArticle) return null;

    // Extract username from the tweet header
    // Look for the @username text or link
    const usernameLink = mainTweetArticle.querySelector('a[href^="/"]');
    if (usernameLink) {
      const href = usernameLink.getAttribute('href');
      const match = href.match(/^\/([^\/]+)/);
      if (match) {
        state.mainTweetAuthor = match[1].toLowerCase();
        return state.mainTweetAuthor;
      }
    }

    return null;
  }

  // Get the author of a tweet element
  function getTweetAuthor(article) {
    // Find the username link in this tweet
    const usernameLink = article.querySelector('a[href^="/"]');
    if (usernameLink) {
      const href = usernameLink.getAttribute('href');
      const match = href.match(/^\/([^\/]+)/);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    return null;
  }

  // Process a single reply element
  function processReply(article) {
    if (!state.enabled) return;
    if (state.processedTweets.has(article)) return;
    state.processedTweets.add(article);

    // Only process on status pages (individual tweet threads)
    if (!window.location.pathname.includes('/status/')) {
      return;
    }

    // Skip main tweet - check if this is the main tweet article
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) return;
    
    // The main tweet is in a specific section/container (different from replies)
    const mainTweetSection = primaryColumn.querySelector('[data-testid="tweet"]')?.closest('section') ||
                             primaryColumn.querySelector('[data-testid="tweet"]')?.closest('div[data-testid="cellInnerDiv"]');
    
    // If this article is inside the main tweet's section, skip it
    if (mainTweetSection && mainTweetSection.contains(article)) {
      // Check if it's the MAIN tweet article itself, not a nested one
      const mainTweetArticle = mainTweetSection.querySelector('article[data-testid="tweet"]');
      if (mainTweetArticle === article) {
        return;
      }
    }

    // Get tweet text
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    if (!tweetTextEl) return;

    const text = tweetTextEl.textContent || '';
    if (!text.trim()) return;

    // Skip if this reply is from the main tweet author
    const mainAuthor = getMainTweetAuthor();
    const replyAuthor = getTweetAuthor(article);
    if (mainAuthor && replyAuthor && mainAuthor === replyAuthor) {
      return;
    }

    // Analyze and potentially hide
    const score = analyzeReply(text);
    
    if (shouldHide(score)) {
      hideReply(article, score.reasons);
    }
  }

  // Extract unique tweet ID from article element
  function getTweetId(article) {
    // Try to get from tweet link (most reliable)
    const tweetLink = article.querySelector('a[href*="/status/"]');
    if (tweetLink) {
      const match = tweetLink.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    // Fallback: use article's time element link
    const timeLink = article.querySelector('time')?.parentElement?.href;
    if (timeLink) {
      const match = timeLink.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  // Hide a reply
  function hideReply(article, reasons) {
    if (article.classList.contains('spam-hidden')) return;
    
    article.classList.add('spam-hidden');
    article.dataset.spamReasons = reasons.join(',');
    article.dataset.spamFiltered = 'true';
    state.hiddenInThread++;
    state.hiddenTweets.add(article);
    
    // Only count unique tweets for hiddenToday
    const tweetId = getTweetId(article);
    if (tweetId && !state.countedTweetIds.has(tweetId)) {
      state.countedTweetIds.add(tweetId);
      state.hiddenToday++;
      // Save updated count and tracked IDs
      chrome.storage.local.set({ 
        hiddenToday: state.hiddenToday,
        countedTweetIds: Array.from(state.countedTweetIds)
      });
    }
    
    // Block Twitter's hover effects by setting inline style
    article.style.setProperty('display', 'none', 'important');
    
    updateSpamBar();
    updateToggleCount();
  }

  // Reset all spam styles when extension is disabled
  function resetAllSpamStyles() {
    document.querySelectorAll('[data-spam-filtered="true"]').forEach(el => {
      // Remove all spam classes
      el.classList.remove('spam-hidden', 'spam-revealed');
      
      // Remove inline styles
      el.style.removeProperty('opacity');
      el.style.removeProperty('border-left');
      el.style.removeProperty('position');
      el.style.removeProperty('display');
      el.style.removeProperty('background-color');
      el.style.removeProperty('overflow');
      
      // Remove spam badge element
      const badge = el.querySelector('.spam-badge');
      if (badge) {
        badge.remove();
      }
      
      // Remove event listeners by cloning (crude but effective)
      const newEl = el.cloneNode(true);
      newEl.removeAttribute('data-spam-filtered');
      el.parentNode.replaceChild(newEl, el);
    });
    
    state.hiddenInThread = 0;
    state.spamBar?.remove();
    state.spamBar = null;
  }

  // Show all hidden replies
  function showAllHidden() {
    document.querySelectorAll('.spam-hidden').forEach(el => {
      el.classList.remove('spam-hidden');
      el.classList.add('spam-revealed');
      el.style.removeProperty('display');
      applyRevealedStyles(el);
    });
    state.hiddenInThread = 0;
    updateSpamBar();
  }

  // Apply revealed styles inline to override Twitter
  function applyRevealedStyles(el) {
    el.style.setProperty('opacity', '0.4', 'important');
    el.style.setProperty('border-left', '3px solid #f4212e', 'important');
    el.style.setProperty('position', 'relative', 'important');
    
    // Add spam badge as actual DOM element (not CSS pseudo-element)
    if (!el.querySelector('.spam-badge')) {
      const badge = document.createElement('div');
      badge.className = 'spam-badge';
      badge.textContent = '🛡️ Spam';
      badge.style.cssText = `
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        background: rgba(244, 33, 46, 0.95) !important;
        color: white !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        z-index: 9999 !important;
        pointer-events: none !important;
        opacity: 1 !important;
      `;
      el.style.setProperty('overflow', 'visible', 'important');
      el.insertBefore(badge, el.firstChild);
    }
    
    // Override hover effect by preventing background changes
    el.addEventListener('mouseenter', preventTwitterHover);
    el.addEventListener('mouseleave', preventTwitterHover);
  }
  
  // Prevent Twitter from overriding styles on hover
  function preventTwitterHover(e) {
    const el = e.currentTarget;
    if (el.dataset.spamFiltered === 'true') {
      el.style.setProperty('opacity', '0.4', 'important');
      el.style.setProperty('background-color', 'transparent', 'important');
      
      // Re-ensure badge is visible
      const badge = el.querySelector('.spam-badge');
      if (badge) {
        badge.style.setProperty('opacity', '1', 'important');
        badge.style.setProperty('display', 'block', 'important');
      }
    }
  }

  // Toggle hidden replies visibility
  function toggleHiddenReplies() {
    const hidden = document.querySelectorAll('.spam-hidden');
    const revealed = document.querySelectorAll('.spam-revealed');
    
    if (hidden.length > 0) {
      // Show hidden
      hidden.forEach(el => {
        el.classList.remove('spam-hidden');
        el.classList.add('spam-revealed');
        el.style.removeProperty('display');
        applyRevealedStyles(el);
      });
      if (state.spamBar) {
        state.spamBar.querySelector('.spam-bar-text').textContent = 
          `🔼 ${state.hiddenInThread} spam replies shown (click to hide)`;
        state.spamBar.classList.add('spam-bar-revealed');
      }
    } else if (revealed.length > 0) {
      // Hide revealed
      revealed.forEach(el => {
        el.classList.remove('spam-revealed');
        el.classList.add('spam-hidden');
        el.style.setProperty('display', 'none', 'important');
        el.style.removeProperty('opacity');
        el.style.removeProperty('border-left');
      });
      if (state.spamBar) {
        state.spamBar.querySelector('.spam-bar-text').textContent = 
          `🔽 ${state.hiddenInThread} spam replies hidden (click to show)`;
        state.spamBar.classList.remove('spam-bar-revealed');
      }
    }
  }

  // Update or create the spam bar
  function updateSpamBar() {
    // Only show spam bar on tweet detail pages (status pages)
    if (!window.location.pathname.includes('/status/')) {
      if (state.spamBar) {
        state.spamBar.remove();
        state.spamBar = null;
      }
      return;
    }
    
    if (state.hiddenInThread === 0) {
      if (state.spamBar) {
        state.spamBar.remove();
        state.spamBar = null;
      }
      return;
    }

    // Check if spam bar was removed from DOM (Twitter virtualizes content on scroll)
    if (state.spamBar && !document.body.contains(state.spamBar)) {
      state.spamBar = null;
    }

    if (!state.spamBar) {
      state.spamBar = document.createElement('div');
      state.spamBar.className = 'spam-filter-bar';
      state.spamBar.dataset.spamBar = 'true';
      state.spamBar.innerHTML = `
        <span class="spam-bar-icon">🛡️</span>
        <span class="spam-bar-text"></span>
      `;
      state.spamBar.addEventListener('click', toggleHiddenReplies);
    }
    
    // Find the main tweet article and insert the bar below it
    const mainColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (mainColumn) {
      const mainTweet = mainColumn.querySelector('article[data-testid="tweet"]');
      if (mainTweet) {
        // Find the section that contains the main tweet (the detailed tweet view)
        let mainTweetSection = mainTweet.closest('section');
        
        // If found, try to insert after it
        if (mainTweetSection && mainTweetSection.nextElementSibling) {
          const insertTarget = mainTweetSection.nextElementSibling;
          
          // Safety checks: ensure spam bar isn't already a parent of insertTarget
          if (!state.spamBar.contains(insertTarget) && state.spamBar.parentElement !== insertTarget) {
            // Remove from old parent if it exists
            if (state.spamBar.parentElement) {
              state.spamBar.parentElement.removeChild(state.spamBar);
            }
            
            // Insert at the beginning of the replies section
            insertTarget.insertBefore(state.spamBar, insertTarget.firstChild);
          }
        }
      }
    }

    const hasHidden = document.querySelectorAll('.spam-hidden').length > 0;
    state.spamBar.querySelector('.spam-bar-text').textContent = hasHidden
      ? `${state.hiddenInThread} spam replies hidden (click to show)`
      : `${state.hiddenInThread} spam replies shown (click to hide)`;
    
    if (!hasHidden) {
      state.spamBar.classList.add('spam-bar-revealed');
    } else {
      state.spamBar.classList.remove('spam-bar-revealed');
    }
  }

  // Create and manage toggle switch on main tweet
  function createToggleSwitch() {
    // Only show on tweet detail pages
    if (!window.location.pathname.includes('/status/')) {
      if (state.spamToggle) {
        state.spamToggle.remove();
        state.spamToggle = null;
      }
      return;
    }

    // Check if toggle was removed from DOM
    if (state.spamToggle && !document.body.contains(state.spamToggle)) {
      state.spamToggle = null;
    }

    // Don't create if already exists
    if (state.spamToggle) return;

    const mainColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!mainColumn) return;

    const mainTweet = mainColumn.querySelector('article[data-testid="tweet"]');
    if (!mainTweet) return;

    // Find the User-Name element to inject next to
    const userNameEl = mainTweet.querySelector('div[data-testid="User-Name"]');
    if (!userNameEl) return;

    // Create toggle container
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'spam-toggle-container';
    toggleContainer.dataset.spamToggle = 'true';
    
    // Logic: 
    // state.showSpam = false (default) -> Spam is hidden -> Toggle ON (Active)
    // state.showSpam = true -> Spam is shown -> Toggle OFF (Inactive)
    const isHidden = !state.showSpam;
    const spamCount = state.hiddenInThread || 0;
    
    toggleContainer.innerHTML = `
      <span class="spam-toggle-label">Hide Spam</span>
      <span class="spam-toggle-count ${spamCount > 0 ? 'has-spam' : ''}">${spamCount}</span>
      <div class="spam-toggle-switch ${isHidden ? 'active' : ''}">
        <div class="spam-toggle-slider"></div>
      </div>
    `;

    // Add click handler to the whole container
    toggleContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      state.showSpam = !state.showSpam;
      const newIsHidden = !state.showSpam;
      toggleContainer.querySelector('.spam-toggle-switch').classList.toggle('active', newIsHidden);
      
      // Toggle spam visibility
      if (state.showSpam) {
        showAllHidden();
      } else {
        hideAllRevealed();
      }
    });

    // Find the specific target div: the header row container in the main tweet
    // Path: article > div > div > div.r-18u37iz.r-136ojw6 > div.r-1iusvr4 > div > div
    const headerRow = mainTweet.querySelector('div.r-18u37iz.r-136ojw6 > div.r-1iusvr4.r-16y2uox.r-1777fci > div > div');
    
    if (headerRow) {
      headerRow.style.display = 'flex';
      headerRow.style.alignItems = 'center';
      headerRow.style.gap = '8px';
      
      // Find the Grok actions container (r-1kkk96v) and insert before it
      const grokContainer = headerRow.querySelector('div.r-1kkk96v');
      if (grokContainer) {
        headerRow.insertBefore(toggleContainer, grokContainer);
      } else {
        headerRow.appendChild(toggleContainer);
      }
    } else {
      // Fallback: append after User-Name
      userNameEl.parentElement.style.display = 'flex';
      userNameEl.parentElement.style.alignItems = 'center';
      userNameEl.parentElement.appendChild(toggleContainer);
    }
    
    state.spamToggle = toggleContainer;
  }

  // Update toggle spam count
  function updateToggleCount() {
    if (!state.spamToggle) return;
    const countEl = state.spamToggle.querySelector('.spam-toggle-count');
    if (countEl) {
      const count = state.hiddenInThread || 0;
      countEl.textContent = count;
      countEl.classList.toggle('has-spam', count > 0);
    }
  }

  // Hide all revealed spam replies
  function hideAllRevealed() {
    document.querySelectorAll('.spam-revealed').forEach(el => {
      el.classList.remove('spam-revealed');
      el.classList.add('spam-hidden');
      el.style.setProperty('display', 'none', 'important');
      el.style.removeProperty('opacity');
      el.style.removeProperty('border-left');
      
      // Remove spam badge
      const badge = el.querySelector('.spam-badge');
      if (badge) badge.remove();
    });
    updateSpamBar();
  }

  // Process existing replies on page
  function processExistingReplies() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(processReply);
  }

  // Reprocess all replies (when sensitivity changes)
  function reprocessAllReplies() {
    // Reset state
    state.processedTweets = new WeakSet();
    state.hiddenInThread = 0;
    state.hiddenTweets.clear();
    
    // Remove all spam classes
    document.querySelectorAll('.spam-hidden, .spam-revealed').forEach(el => {
      el.classList.remove('spam-hidden', 'spam-revealed');
      delete el.dataset.spamReasons;
    });
    
    // Remove spam bar
    if (state.spamBar) {
      state.spamBar.remove();
      state.spamBar = null;
    }
    
    // Reprocess
    processExistingReplies();
  }

  // MutationObserver to detect new replies
  let observer = null;
  
  function startObserver() {
    if (observer) return;
    
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is an article or contains articles
            if (node.matches?.('article[data-testid="tweet"]')) {
              processReply(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('article[data-testid="tweet"]').forEach(processReply);
            }
          }
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Reset thread counter on navigation
  let lastUrl = window.location.href;
  
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      state.hiddenInThread = 0;
      state.processedTweets = new WeakSet();
      state.hiddenTweets.clear();
      state.showSpam = false;
      if (state.spamBar) {
        state.spamBar.remove();
        state.spamBar = null;
      }
      if (state.spamToggle) {
        state.spamToggle.remove();
        state.spamToggle = null;
      }
    }
    
    // Re-check spam bar visibility (Twitter may remove it during scroll)
    if (state.hiddenInThread > 0) {
      updateSpamBar();
    }
    
    // Create or update toggle switch
    createToggleSwitch();
  }
  
  setInterval(checkUrlChange, 500);

  // Start extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
