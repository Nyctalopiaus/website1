document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const cipherSelect = document.getElementById('cipher-select');
  const inputText = document.getElementById('input-text');
  const outputText = document.getElementById('output-text');
  const hexToggle = document.getElementById('hex-toggle');
  const outputEntropyVal = document.getElementById('output-entropy-val');
  const freqChart = document.getElementById('freq-chart');

  // Key groups
  const keyCaesarGroup = document.getElementById('key-group-caesar');
  const keyVigenereGroup = document.getElementById('key-group-vigenere');
  const keyRailfenceGroup = document.getElementById('key-group-railfence');
  const keyXorGroup = document.getElementById('key-group-xor');

  // Key inputs
  const keyCaesar = document.getElementById('key-caesar');
  const keyVigenere = document.getElementById('key-vigenere');
  const keyRailfence = document.getElementById('key-railfence');
  const keyXor = document.getElementById('key-xor');

  // Action buttons
  const btnEncrypt = document.getElementById('btn-encrypt');
  const btnDecrypt = document.getElementById('btn-decrypt');

  // CTF elements
  const btnCtfGenerate = document.getElementById('btn-ctf-generate');
  const ctfActiveArea = document.getElementById('ctf-active-area');
  const ctfCiphertext = document.getElementById('ctf-ciphertext');
  const ctfGuess = document.getElementById('ctf-guess');
  const btnCtfSubmit = document.getElementById('btn-ctf-submit');
  const btnCtfReveal = document.getElementById('btn-ctf-reveal');
  const ctfFeedback = document.getElementById('ctf-feedback');

  // Active state data cache
  let rawOutput = ''; // Cache the unformatted decrypted/encrypted output string
  let animationInterval = null;

  // CTF Challenge Pool
  const ctfQuotes = [
    "THE ARREST OF KEVIN MITNICK SIGNALED THE BEGINNING OF CYBER DEFENSE POLICIES",
    "THERE IS NO SECURITY ON THIS EARTH ONLY OPPORTUNITY AND EXPLOITATION",
    "ONE ENCRYPTED BLOCK IN FLIGHT SAVES A MILLION BYTES OF CORPORATE CORRUPTION",
    "SHANNON ENTROPY DEFINES THE LIMITS OF RAW DATA ENCODING COMPRESSION",
    "A HACKER IS AN INDIVIDUAL WHO CHALLENGES DOMINANT SYSTEMS OF TECHNICAL CONTROL"
  ];
  let activeCtfAnswer = '';
  let activeCtfPlaintext = '';
  let activeCtfCiphertext = '';
  let activeCtfKey = '';

  // Toggle visible key inputs based on selected cipher
  cipherSelect.addEventListener('change', () => {
    keyCaesarGroup.style.display = 'none';
    keyVigenereGroup.style.display = 'none';
    keyRailfenceGroup.style.display = 'none';
    keyXorGroup.style.display = 'none';

    switch (cipherSelect.value) {
      case 'caesar':
        keyCaesarGroup.style.display = 'block';
        break;
      case 'vigenere':
        keyVigenereGroup.style.display = 'block';
        break;
      case 'railfence':
        keyRailfenceGroup.style.display = 'block';
        break;
      case 'xor':
        keyXorGroup.style.display = 'block';
        break;
    }
  });

  // =========================================================================
  // CRYPTOGRAPHIC ALGORITHMS IMPLEMENTATION
  // =========================================================================

  /**
   * 1. Caesar Cipher (Substitution)
   * Shifts letters by an integer key value. Preserves capitalization.
   */
  function caesarEncrypt(text, shift) {
    shift = ((shift % 26) + 26) % 26;
    return text.split('').map(char => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      } else if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26) + 97);
      }
      return char;
    }).join('');
  }

  function caesarDecrypt(text, shift) {
    return caesarEncrypt(text, -shift);
  }

  /**
   * 2. Vigenère Cipher (Polyalphabetic Substitution)
   * Uses a keyword to determine shifting indices per character.
   */
  function vigenereEncrypt(text, key) {
    if (!key) return text;
    key = key.toUpperCase().replace(/[^A-Z]/g, '');
    if (key.length === 0) return text;

    let keyIndex = 0;
    return text.split('').map(char => {
      const code = char.charCodeAt(0);
      let isUpper = code >= 65 && code <= 90;
      let isLower = code >= 97 && code <= 122;
      
      if (isUpper || isLower) {
        const base = isUpper ? 65 : 97;
        const shift = key.charCodeAt(keyIndex % key.length) - 65;
        keyIndex++;
        return String.fromCharCode(((code - base + shift) % 26) + base);
      }
      return char;
    }).join('');
  }

  function vigenereDecrypt(text, key) {
    if (!key) return text;
    key = key.toUpperCase().replace(/[^A-Z]/g, '');
    if (key.length === 0) return text;

    let keyIndex = 0;
    return text.split('').map(char => {
      const code = char.charCodeAt(0);
      let isUpper = code >= 65 && code <= 90;
      let isLower = code >= 97 && code <= 122;
      
      if (isUpper || isLower) {
        const base = isUpper ? 65 : 97;
        const shift = key.charCodeAt(keyIndex % key.length) - 65;
        keyIndex++;
        return String.fromCharCode(((code - base - shift + 26) % 26) + base);
      }
      return char;
    }).join('');
  }

  /**
   * 3. Rail Fence Cipher (Transposition)
   * Writes the message along rails in a zig-zag, then reads off row-by-row.
   */
  function railFenceEncrypt(text, rails) {
    if (rails < 2 || text.length <= rails) return text;

    const fence = Array.from({ length: rails }, () => []);
    let rail = 0;
    let direction = 1;

    for (let char of text) {
      fence[rail].push(char);
      rail += direction;
      if (rail === rails - 1 || rail === 0) {
        direction = -direction;
      }
    }
    return fence.flat().join('');
  }

  function railFenceDecrypt(text, rails) {
    if (rails < 2 || text.length <= rails) return text;

    const fencePattern = Array.from({ length: rails }, () => Array(text.length).fill(null));
    let rail = 0;
    let direction = 1;

    for (let i = 0; i < text.length; i++) {
      fencePattern[rail][i] = '*';
      rail += direction;
      if (rail === rails - 1 || rail === 0) {
        direction = -direction;
      }
    }

    let textIdx = 0;
    for (let r = 0; r < rails; r++) {
      for (let c = 0; c < text.length; c++) {
        if (fencePattern[r][c] === '*' && textIdx < text.length) {
          fencePattern[r][c] = text[textIdx++];
        }
      }
    }

    rail = 0;
    direction = 1;
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += fencePattern[rail][i];
      rail += direction;
      if (rail === rails - 1 || rail === 0) {
        direction = -direction;
      }
    }
    return result;
  }

  /**
   * 4. Repeating XOR Byte Cipher (Custom Bitwise)
   * Performs XOR bitwise logic on input characters using key characters.
   */
  function xorEncrypt(text, key) {
    if (!key) return text;
    return text.split('').map((char, index) => {
      const keyChar = key.charCodeAt(index % key.length);
      const xorValue = char.charCodeAt(0) ^ keyChar;
      return String.fromCharCode(xorValue);
    }).join('');
  }

  function xorDecrypt(text, key) {
    return xorEncrypt(text, key); // XOR decryption is identical to encryption
  }

  // =========================================================================
  // GLITCH VISUAL EFFECTS ENGINE & REVEALS
  // =========================================================================

  function runGlitchReveal(finalText) {
    clearInterval(animationInterval);
    
    const duration = 800; // Total scramble duration (ms)
    const intervalMs = 40; // Clock tick speed
    const totalFrames = duration / intervalMs;
    let frame = 0;

    // Output is displayed as Hex or ASCII depending on toggler state
    const displayFormat = (text) => hexToggle.checked ? toHexDump(text) : printableText(text);

    // Dynamic noise bank
    const noiseBank = "01$#@!%^&*_+=-{}[]:;?/<>~|ABCDEF";

    animationInterval = setInterval(() => {
      frame++;
      
      // Calculate how many characters from the left should be "locked"
      const resolvedLen = Math.floor((frame / totalFrames) * finalText.length);
      
      let scrambled = '';
      for (let i = 0; i < finalText.length; i++) {
        if (i < resolvedLen) {
          scrambled += finalText[i];
        } else {
          scrambled += noiseBank[Math.floor(Math.random() * noiseBank.length)];
        }
      }

      outputText.innerHTML = displayFormat(scrambled);

      if (frame >= totalFrames) {
        clearInterval(animationInterval);
        outputText.innerHTML = displayFormat(finalText);
      }
    }, intervalMs);
  }

  // Helper to filter out non-printable ASCII characters for safe web rendering
  function printableText(text) {
    return text.split('').map(char => {
      const code = char.charCodeAt(0);
      if (code < 32 || code > 126) {
        return '.'; // Substitute with dot placeholder
      }
      return char;
    }).join('');
  }

  // =========================================================================
  // CYBER ANALYTICS: ENTROPY, FREQUENCY CHART, AND HEX DUMP
  // =========================================================================

  /**
   * Calculates Shannon Entropy H(X) in bits per character.
   */
  function calculateEntropy(text) {
    if (text.length === 0) return 0;
    const freqs = {};
    for (let char of text) {
      freqs[char] = (freqs[char] || 0) + 1;
    }
    let entropy = 0;
    for (let char in freqs) {
      const p = freqs[char] / text.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /**
   * Translates plain string data into classic Hex Dump view grid.
   */
  function toHexDump(text) {
    if (text.length === 0) return 'NO DATA';
    let hexRows = [];

    for (let offset = 0; offset < text.length; offset += 16) {
      // 1. Offsets (e.g. 0000)
      const offsetHex = offset.toString(16).toUpperCase().padStart(8, '0');
      
      // 2. Hex pairs
      let hexPairs = [];
      let asciiRepresentation = '';
      
      for (let i = 0; i < 16; i++) {
        if (offset + i < text.length) {
          const code = text.charCodeAt(offset + i);
          hexPairs.push(code.toString(16).toUpperCase().padStart(2, '0'));
          
          // ASCII character checking
          if (code >= 32 && code <= 126) {
            asciiRepresentation += text[offset + i];
          } else {
            asciiRepresentation += '.';
          }
        } else {
          hexPairs.push('  '); // spacer
          asciiRepresentation += ' ';
        }
      }

      // Split into two blocks of 8 for spacing
      const firstBlock = hexPairs.slice(0, 8).join(' ');
      const secondBlock = hexPairs.slice(8, 16).join(' ');
      
      hexRows.push(`${offsetHex}  ${firstBlock}  ${secondBlock}  |${asciiRepresentation}|`);
    }

    return hexRows.join('\n');
  }

  /**
   * Generates character frequency histogram bars.
   */
  function renderFrequencyChart(text) {
    // Count alphabet characters A-Z exclusively (standard cryptography convention)
    const normalized = text.toUpperCase().replace(/[^A-Z]/g, '');
    const counts = Array(26).fill(0);
    
    for (let char of normalized) {
      const idx = char.charCodeAt(0) - 65;
      if (idx >= 0 && idx < 26) {
        counts[idx]++;
      }
    }

    const maxCount = Math.max(...counts, 1);
    freqChart.innerHTML = '';

    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      const pct = (counts[i] / maxCount) * 100;

      const container = document.createElement('div');
      container.className = 'chart-bar-container';

      const bar = document.createElement('div');
      bar.className = 'chart-bar-inner';
      bar.style.height = `${pct}%`;
      bar.setAttribute('data-count', counts[i]);

      const label = document.createElement('div');
      label.className = 'chart-bar-label';
      label.textContent = letter;

      container.appendChild(bar);
      container.appendChild(label);
      freqChart.appendChild(container);
    }
  }

  // Update output layouts dynamically on hex dump toggles
  hexToggle.addEventListener('change', () => {
    if (rawOutput) {
      if (hexToggle.checked) {
        outputText.innerHTML = toHexDump(rawOutput);
      } else {
        outputText.innerHTML = printableText(rawOutput);
      }
    }
  });

  // =========================================================================
  // ACTION TRIGGERS: ENCRYPT & DECRYPT
  // =========================================================================

  function runCipher(isEncrypt) {
    const text = inputText.value;
    if (text.length === 0) {
      alert("Input payload is empty!");
      return;
    }

    const cipher = cipherSelect.value;
    let result = '';

    switch (cipher) {
      case 'caesar':
        const shift = parseInt(keyCaesar.value) || 3;
        result = isEncrypt ? caesarEncrypt(text, shift) : caesarDecrypt(text, shift);
        break;
      case 'vigenere':
        const vKey = keyVigenere.value;
        result = isEncrypt ? vigenereEncrypt(text, vKey) : vigenereDecrypt(text, vKey);
        break;
      case 'railfence':
        const rails = parseInt(keyRailfence.value) || 3;
        result = isEncrypt ? railFenceEncrypt(text, rails) : railFenceDecrypt(text, rails);
        break;
      case 'xor':
        const xKey = keyXor.value;
        result = isEncrypt ? xorEncrypt(text, xKey) : xorDecrypt(text, xKey);
        break;
    }

    rawOutput = result;
    
    // Update dashboard statistics
    const entropy = calculateEntropy(result);
    outputEntropyVal.textContent = `${entropy.toFixed(3)} bits/char`;
    renderFrequencyChart(result);

    // Start reveal animation
    runGlitchReveal(result);
  }

  btnEncrypt.addEventListener('click', () => runCipher(true));
  btnDecrypt.addEventListener('click', () => runCipher(false));

  // =========================================================================
  // CTF CHALLENGE CONTROLLER
  // =========================================================================

  btnCtfGenerate.addEventListener('click', () => {
    // Select quote
    const plainQuote = ctfQuotes[Math.floor(Math.random() * ctfQuotes.length)];
    activeCtfPlaintext = plainQuote;

    // Randomize algorithm choice
    const algorithms = ['caesar', 'vigenere', 'railfence', 'xor'];
    const chosenAlgo = algorithms[Math.floor(Math.random() * algorithms.length)];
    activeCtfAnswer = chosenAlgo;

    // Generate random keys
    let ciphertext = '';
    switch (chosenAlgo) {
      case 'caesar':
        const shift = Math.floor(Math.random() * 20) + 3; // 3-23
        ciphertext = caesarEncrypt(plainQuote, shift);
        activeCtfKey = `Shift key: ${shift}`;
        break;
      case 'vigenere':
        const vKeys = ['DECRYPT', 'CIPHER', 'GOVERN', 'MAINFRAME', 'PACKET'];
        const key = vKeys[Math.floor(Math.random() * vKeys.length)];
        ciphertext = vigenereEncrypt(plainQuote, key);
        activeCtfKey = `Key word: ${key}`;
        break;
      case 'railfence':
        const rails = Math.floor(Math.random() * 4) + 3; // 3-6
        ciphertext = railFenceEncrypt(plainQuote, rails);
        activeCtfKey = `Rails: ${rails}`;
        break;
      case 'xor':
        const xKeys = ['BYTE', 'XOR', 'CODE', 'SIGN'];
        const xKey = xKeys[Math.floor(Math.random() * xKeys.length)];
        ciphertext = xorEncrypt(plainQuote, xKey);
        activeCtfKey = `XOR Key: ${xKey}`;
        break;
    }

    activeCtfCiphertext = ciphertext;
    rawOutput = ciphertext;

    // Display ciphertext (always printable format for display)
    ctfCiphertext.textContent = printableText(ciphertext);
    ctfFeedback.textContent = '';
    ctfFeedback.className = 'ctf-feedback';

    // Update charts & stats with target ciphertext
    const entropy = calculateEntropy(ciphertext);
    outputEntropyVal.textContent = `${entropy.toFixed(3)} bits/char`;
    renderFrequencyChart(ciphertext);

    // Apply the display formats to output monitor
    if (hexToggle.checked) {
      outputText.innerHTML = toHexDump(ciphertext);
    } else {
      outputText.innerHTML = printableText(ciphertext);
    }

    // Toggle active area UI
    ctfActiveArea.style.display = 'block';
    console.log('[CTF DEBUG] Correct answer:', chosenAlgo, 'Key:', activeCtfKey);
  });

  btnCtfSubmit.addEventListener('click', () => {
    const guess = ctfGuess.value;
    if (guess === activeCtfAnswer) {
      ctfFeedback.className = 'ctf-feedback success';
      ctfFeedback.textContent = `✅ FLAG_DECODED // SUCCESS // Key used: ${activeCtfKey}`;
    } else {
      ctfFeedback.className = 'ctf-feedback error';
      ctfFeedback.textContent = '❌ INTEGRITY_CHECK_FAILED // ACCESS_DENIED // RETRY';
    }
  });

  btnCtfReveal.addEventListener('click', () => {
    if (confirm('Are you sure you want to reveal the decryption flag?')) {
      ctfFeedback.className = 'ctf-feedback success';
      ctfFeedback.textContent = `FLAG{${activeCtfAnswer.toUpperCase()}_${activeCtfPlaintext.split(' ')[0]}} // Key: ${activeCtfKey}`;
      
      // Decrypt and show it in the output window
      runGlitchReveal(activeCtfPlaintext);
    }
  });

  // Render initial dummy frequency chart on load
  renderFrequencyChart("INITIALIZING GRAPH SPECTRUM...");
});
