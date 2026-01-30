/* ===================================
   UDEMY COUPON SCRAPER - CORE LOGIC
   =================================== */

// Global state
const state = {
  isRunning: false,
  shouldStop: false,
  coupons: new Set(),
  totalPages: 0,
  currentPage: 0,
  totalCourses: 0,
  processedCourses: 0
};

// CORS Proxy Configuration (dynamic based on user selection)
let CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Available CORS proxies for automatic fallback
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  '' // Direct (no proxy)
];

// DOM Elements
const elements = {
  corsProxySelect: document.getElementById('corsProxy'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  startPageInput: document.getElementById('startPage'),
  endPageInput: document.getElementById('endPage'),
  progressSection: document.getElementById('progressSection'),
  progressBar: document.getElementById('progressBar'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressStatus: document.getElementById('progressStatus'),
  statusMessages: document.getElementById('statusMessages'),
  resultsSection: document.getElementById('resultsSection'),
  resultsCount: document.getElementById('resultsCount'),
  resultsTableBody: document.getElementById('resultsTableBody'),
  copyAllBtn: document.getElementById('copyAllBtn'),
  downloadBtn: document.getElementById('downloadBtn')
};

/* ===================================
   CORS FETCH FUNCTION
   =================================== */

/**
 * Fetch a URL through CORS proxy or directly, with automatic fallback
 * @param {string} url - The URL to fetch
 * @param {boolean} tryAllProxies - If true, try all available proxies on failure
 * @returns {Promise<string>} - HTML content
 */
async function corsFetch(url, tryAllProxies = false) {
  const proxiesToTry = tryAllProxies ? CORS_PROXIES : [CORS_PROXY];
  
  for (let i = 0; i < proxiesToTry.length; i++) {
    const proxy = proxiesToTry[i];
    try {
      // Use proxy if available, otherwise try direct
      const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
      
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      console.warn(`Failed to fetch ${url} with proxy ${proxy || 'direct'}:`, error.message);
      
      // If this is the last proxy to try, throw the error
      if (i === proxiesToTry.length - 1) {
        throw new Error('Unable to fetch content. Please check your internet connection or try a different proxy.');
      }
      
      // Otherwise, try the next proxy
      console.log(`Trying next proxy...`);
    }
  }
}

/* ===================================
   HTML PARSING UTILITIES
   =================================== */

/**
 * Parse HTML string into a DOM document
 * @param {string} html - HTML string
 * @returns {Document} - Parsed document
 */
function parseHTML(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

/* ===================================
   SCRAPING FUNCTIONS
   =================================== */

/**
 * Scrape course page URLs from a DiscUdemy listing page
 * @param {number} pageNum - Page number to scrape
 * @returns {Promise<string[]>} - Array of course page URLs
 */
async function scrapeListingPage(pageNum) {
  const listingUrl = `https://www.discudemy.com/all/${pageNum}`;
  addStatusMessage(`Scraping listing page ${pageNum}...`, 'info');
  
  try {
    const html = await corsFetch(listingUrl);
    const doc = parseHTML(html);
    
    // Find all course cards (section.card elements)
    const cards = Array.from(doc.querySelectorAll('section.card'));
    const courseLinks = [];
    
    for (const card of cards) {
      // Find the course link inside the card header
      const cardHeader = card.querySelector('a.card-header');
      
      if (cardHeader) {
        const href = cardHeader.getAttribute('href');
        
        if (href) {
          // Convert relative URLs to absolute
          const fullUrl = href.startsWith('http') 
            ? href 
            : 'https://www.discudemy.com' + href;
          
          if (!courseLinks.includes(fullUrl)) {
            courseLinks.push(fullUrl);
          }
        }
      }
    }
    
    addStatusMessage(`Found ${courseLinks.length} courses on page ${pageNum}`, 'success');
    return courseLinks;
  } catch (error) {
    // Sanitize error message to remove URLs and specific domain names
    let cleanMsg = error.message
      .replace(/(https?:\/\/[^\s]+)/g, '') // Remove URLs
      .replace(/discudemy/gi, 'source')     // Remove domain name
      .replace(/proxy/gi, 'connection');    // Remove proxy mentions
      
    addStatusMessage(`Error scraping page ${pageNum}: ${cleanMsg}`, 'error');
    return [];
  }
}

/**
 * Extract Udemy coupon link from a DiscUdemy course page
 * @param {string} courseUrl - DiscUdemy course page URL (e.g., /r-programming/r-for-research)
 * @returns {Promise<string|null>} - Udemy coupon URL or null
 */
async function extractCouponLink(courseUrl) {
  try {
    // Step 1: Visit the course detail page (try all proxies if needed)
    const html = await corsFetch(courseUrl, true);
    
    // Step 2: Find the "Take Course" redirect link
    // Try to extract from raw HTML first (more reliable with CORS proxies)
    let redirectUrl = null;
    
    // Pattern 1: Look for /go/course-name in the HTML
    const goLinkMatch = html.match(/href=["'](\/go\/[^"']+)["']/i);
    if (goLinkMatch) {
      redirectUrl = 'https://www.discudemy.com' + goLinkMatch[1];
    }
    
    // Pattern 2: Try parsing the DOM if regex didn't work
    if (!redirectUrl) {
      const doc = parseHTML(html);
      const takeCourseBtn = doc.querySelector('a[href*="/go/"]');
      
      if (takeCourseBtn) {
        const href = takeCourseBtn.getAttribute('href');
        if (href) {
          redirectUrl = href.startsWith('http') 
            ? href 
            : 'https://www.discudemy.com' + href;
        }
      }
    }
    
    if (!redirectUrl) {
      console.warn(`No "Take Course" link found on ${courseUrl}`);
      return null;
    }
    
    // Step 3: Visit the redirect page (try all proxies if needed)
    const redirectHtml = await corsFetch(redirectUrl, true);
    
    // Step 4: Extract the final Udemy coupon URL
    // Try regex first (most reliable)
    const couponMatch = redirectHtml.match(/https?:\/\/(?:www\.)?udemy\.com\/course\/[^?\s"']+\?couponCode=[A-Z0-9_]+/i);
    
    if (couponMatch) {
      return couponMatch[0];
    }
    
    // Fallback: Try DOM parsing
    const redirectDoc = parseHTML(redirectHtml);
    const udemyLinks = Array.from(redirectDoc.querySelectorAll('a[href*="udemy.com"]'));
    
    for (const link of udemyLinks) {
      const href = link.getAttribute('href');
      if (href && href.includes('couponCode=')) {
        // Clean up the URL
        let cleanUrl = href;
        
        // Handle relative URLs
        if (cleanUrl.startsWith('//')) {
          cleanUrl = 'https:' + cleanUrl;
        } else if (cleanUrl.startsWith('/')) {
          cleanUrl = 'https://www.udemy.com' + cleanUrl;
        }
        
        return cleanUrl;
      }
    }
    
    console.warn(`No coupon URL found on redirect page ${redirectUrl}`);
    return null;
    
  } catch (error) {
    console.error(`Error extracting coupon from ${courseUrl}:`, error);
    return null;
  }
}

/* ===================================
   MAIN SCRAPING WORKFLOW
   =================================== */

/**
 * Main scraping function
 */
async function startScraping() {
  // Update CORS proxy from selection
  CORS_PROXY = elements.corsProxySelect.value;
  
  // Reset state
  state.isRunning = true;
  state.shouldStop = false;
  state.coupons.clear();
  state.currentPage = 0;
  state.processedCourses = 0;
  
  // Get page range
  const startPage = parseInt(elements.startPageInput.value) || 1;
  const endPage = parseInt(elements.endPageInput.value) || 1;
  state.totalPages = endPage - startPage + 1;
  
  // Update UI
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  elements.progressSection.classList.add('active');
  elements.resultsSection.classList.add('active');
  elements.statusMessages.innerHTML = '';
  elements.resultsTableBody.innerHTML = '';
  
  const proxyName = CORS_PROXY ? CORS_PROXY.split('/')[2] : 'Direct';
  addStatusMessage(`Starting scraper... Pages ${startPage} to ${endPage} (Proxy: ${proxyName})`, 'info');
  
  // Collect all course URLs first
  const allCourseUrls = [];
  
  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    if (state.shouldStop) {
      addStatusMessage('Scraping stopped by user', 'info');
      break;
    }
    
    state.currentPage = pageNum - startPage + 1;
    updateProgress();
    
    const courseUrls = await scrapeListingPage(pageNum);
    allCourseUrls.push(...courseUrls);
    
    // Small delay to avoid overwhelming the proxy
    await sleep(500);
  }
  
  state.totalCourses = allCourseUrls.length;
  addStatusMessage(`Found ${state.totalCourses} total courses. Extracting coupons...`, 'info');
  
  // Extract coupons from each course
  for (let i = 0; i < allCourseUrls.length; i++) {
    if (state.shouldStop) {
      addStatusMessage('Scraping stopped by user', 'info');
      break;
    }
    
    const courseUrl = allCourseUrls[i];
    state.processedCourses = i + 1;
    updateProgress();
    
    const couponLink = await extractCouponLink(courseUrl);
    
    if (couponLink) {
      state.coupons.add(couponLink);
      addCouponToTable(couponLink);
      updateResultsCount();
    }
    
    // Small delay between requests
    await sleep(300);
  }
  
  // Finish
  state.isRunning = false;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  
  updateProgress(100);
  addStatusMessage(`✅ Scraping complete! Found ${state.coupons.size} unique coupons.`, 'success');
}

/**
 * Stop the scraping process
 */
function stopScraping() {
  state.shouldStop = true;
  addStatusMessage('Stopping scraper...', 'info');
}

/* ===================================
   UI UPDATE FUNCTIONS
   =================================== */

/**
 * Update progress bar and status
 * @param {number} percentage - Optional percentage override
 */
function updateProgress(percentage = null) {
  let progress = percentage;
  
  if (progress === null) {
    // Calculate progress based on pages and courses
    const pageProgress = (state.currentPage / state.totalPages) * 50;
    const courseProgress = state.totalCourses > 0 
      ? (state.processedCourses / state.totalCourses) * 50 
      : 0;
    progress = Math.min(100, pageProgress + courseProgress);
  }
  
  elements.progressBar.style.width = `${progress}%`;
  elements.progressPercentage.textContent = `${Math.round(progress)}%`;
  
  const status = state.totalCourses > 0
    ? `Processing course ${state.processedCourses} of ${state.totalCourses}`
    : `Scanning page ${state.currentPage} of ${state.totalPages}`;
  
  elements.progressStatus.textContent = status;
}

/**
 * Add a status message
 * @param {string} message - Message text
 * @param {string} type - Message type: 'info', 'success', 'error'
 */
function addStatusMessage(message, type = 'info') {
  const messageEl = document.createElement('div');
  messageEl.className = `status-message ${type}`;
  messageEl.textContent = message;
  
  elements.statusMessages.appendChild(messageEl);
  
  // Keep only last 5 messages
  while (elements.statusMessages.children.length > 5) {
    elements.statusMessages.removeChild(elements.statusMessages.firstChild);
  }
  
  // Auto-scroll to latest message
  elements.statusMessages.scrollTop = elements.statusMessages.scrollHeight;
}

/**
 * Add a coupon to the results table
 * @param {string} couponLink - Udemy coupon URL
 */
function addCouponToTable(couponLink) {
  const row = document.createElement('tr');
  const index = elements.resultsTableBody.children.length + 1;
  
  row.innerHTML = `
    <td>${index}</td>
    <td><a href="${couponLink}" target="_blank" rel="noopener" class="coupon-link">${couponLink}</a></td>
    <td><button class="btn-copy" data-link="${couponLink}">Copy</button></td>
  `;
  
  elements.resultsTableBody.appendChild(row);
  
  // Add copy functionality
  row.querySelector('.btn-copy').addEventListener('click', function() {
    copyToClipboard(this.dataset.link);
    this.textContent = '✓ Copied!';
    setTimeout(() => {
      this.textContent = 'Copy';
    }, 2000);
  });
}

/**
 * Update results count
 */
function updateResultsCount() {
  elements.resultsCount.textContent = `${state.coupons.size} coupons found`;
}

/* ===================================
   EXPORT FUNCTIONS
   =================================== */

/**
 * Copy all coupon links to clipboard
 */
async function copyAllLinks() {
  if (state.coupons.size === 0) {
    showToast('No coupons to copy!', 'error');
    return;
  }
  
  // Format the content with custom header
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).replace(/\//g, '/');
  const formattedTime = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true 
  }).toLowerCase();
  
  const header = `================================================================
UDEMY COUPONS SCRAPER
================================================================
Automatically discover and collect free Udemy course coupons.
Built with ❤️ By: Engineer Qadeer
Generated On: ${formattedDate}, ${formattedTime}
Total Coupons Links: ${state.coupons.size}
================================================================

`;
  
  const links = Array.from(state.coupons).join('\n');
  const content = header + links;
  
  try {
    await copyToClipboard(content);
    showToast(`✅ ${state.coupons.size} links copied to clipboard!`, 'success');
    addStatusMessage('All links copied to clipboard!', 'success');
  } catch (error) {
    showToast('❌ Failed to copy links', 'error');
    addStatusMessage('Failed to copy links', 'error');
  }
}

/**
 * Download coupons as a text file
 */
function downloadAsFile() {
  if (state.coupons.size === 0) {
    showToast('No coupons to download!', 'error');
    return;
  }
  
  // Format the content with custom header
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).replace(/\//g, '/');
  const formattedTime = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true 
  }).toLowerCase();
  
  const header = `================================================================
UDEMY COUPONS SCRAPPER
================================================================
Automatically discover and collect free Udemy course coupons.
Built with ❤️ By: Engineer Qadeer
Generated On: ${formattedDate}, ${formattedTime}
Total Coupons Links: ${state.coupons.size}
================================================================
`;
  
  const links = Array.from(state.coupons).join('\n');
  const content = header + links;
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  // Create filename with proper format
  const dateStr = now.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  }).replace(/:/g, '-');
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `udemy-coupons-${dateStr}_${timeStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(`✅ Downloaded ${state.coupons.size} coupons!`, 'success');
  addStatusMessage('File downloaded successfully!', 'success');
}

/* ===================================
   UTILITY FUNCTIONS
   =================================== */

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'success', 'error', 'info'
 */
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Add to body
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

/* ===================================
   EVENT LISTENERS
   =================================== */

// Start button
elements.startBtn.addEventListener('click', startScraping);

// Stop button
elements.stopBtn.addEventListener('click', stopScraping);

// Copy all button
elements.copyAllBtn.addEventListener('click', copyAllLinks);

// Download button
elements.downloadBtn.addEventListener('click', downloadAsFile);

// Input validation
elements.startPageInput.addEventListener('input', function() {
  const start = parseInt(this.value);
  const end = parseInt(elements.endPageInput.value);
  
  if (start > end) {
    elements.endPageInput.value = start;
  }
});

elements.endPageInput.addEventListener('input', function() {
  const start = parseInt(elements.startPageInput.value);
  const end = parseInt(this.value);
  
  if (end < start) {
    this.value = start;
  }
});

/* ===================================
   INITIALIZATION
   =================================== */

console.log('🎓 Udemy Coupon Scraper initialized');
console.log('Ready to scrape for free course coupons!');
