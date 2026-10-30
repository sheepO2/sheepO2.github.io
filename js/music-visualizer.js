window.addEventListener('DOMContentLoaded', function() {
  if (!location.pathname.startsWith('/music')) return;

  var mountTimer = null;
  var playerPollTimer = null;
  var fallbackTimer = null;
  var shell = null;
  var pointCount = 36;
  var waveform = null;
  var renderedOffsets = [];
  var statusNode = null;
  var audioContext = null;
  var analyser = null;
  var frequencyData = null;
  var sourceNode = null;
  var connectedAudio = null;
  var animationFrameId = 0;
  var boundAudio = null;
  var spectrumBlocked = false;
  var stalledTicks = 0;
  var lastCurrentTime = 0;
  var skipCooldown = false;
  var silentTicks = 0;
  var skipGraceUntil = 0;

  function now() {
    return Date.now();
  }

  function extendSkipGrace(ms) {
    skipGraceUntil = Math.max(skipGraceUntil, now() + ms);
  }

  function resetAutoSkipCounters() {
    stalledTicks = 0;
    lastCurrentTime = connectedAudio ? connectedAudio.currentTime : 0;
    silentTicks = 0;
  }

  function shouldSkipDetectionPause(audio) {
    if (!audio) return true;
    if (now() < skipGraceUntil) return true;
    if (audio.paused || audio.ended) return true;
    if (audio.seeking) return true;
    if (audio.readyState < 2) return true;
    return false;
  }

  function createVisualizer() {
    var playerWrap = document.getElementById('music-player-wrap');
    if (!playerWrap || document.getElementById('music-footer-visualizer')) return false;

    shell = document.createElement('section');
    shell.className = 'music-footer-visualizer';
    shell.id = 'music-footer-visualizer';
    shell.setAttribute('aria-label', 'Music visualizer');

    shell.innerHTML = [
      '<div class="music-footer-visualizer__header">',
      '  <span class="music-footer-visualizer__status" id="music-footer-visualizer-status">Waiting for player...</span>',
      '</div>',
      '<div class="music-footer-visualizer__body">',
      '  <svg class="music-footer-visualizer__waveform" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
      '    <polyline id="music-footer-spectrum" points="0,50 100,50"></polyline>',
      '  </svg>',
      '  <div class="music-footer-visualizer__glow"></div>',
      '</div>'
    ].join('');

    playerWrap.parentNode.insertBefore(shell, playerWrap);

    statusNode = shell.querySelector('#music-footer-visualizer-status');
    waveform = shell.querySelector('#music-footer-spectrum');

    return true;
  }

  function setStatus(text) {
    if (statusNode) {
      statusNode.textContent = text;
    }
  }

  function setPlayingState(playing) {
    if (shell) {
      shell.classList.toggle('is-playing', !!playing);
    }
  }

  function setFallbackMode(enabled) {
    if (shell) {
      shell.classList.toggle('is-fallback', !!enabled);
    }
  }

  function renderWaveformFromValues(values, maxValue) {
    if (!waveform) return;

    var points = [];
    var energy = 0;
    var framePeak = 0;
    var frameTotal = 0;
    for (var peakIndex = 0; peakIndex < pointCount; peakIndex++) {
      framePeak = Math.max(framePeak, values[peakIndex] || 0);
      frameTotal += values[peakIndex] || 0;
    }
    var frameAverage = frameTotal / pointCount;
    // Retain the distance between frequency bands. The previous aggressive
    // ceiling clipped too many bins to the same height and made a repeating
    // pattern; this uses each bin's relative energy instead.
    var gainCeiling = Math.max(maxValue * 0.12, framePeak * 1.04, 1);
    var spread = Math.max(framePeak - frameAverage, maxValue * 0.055, 1);
    for (var i = 0; i < pointCount; i++) {
      var raw = values[i] || 0;
      var normalized = Math.min(1, Math.max(0, raw / gainCeiling));
      // Keep silence as an actual straight line; ease each live bucket toward
      // its target instead of snapping from the idle line to a full waveform.
      var relativeEnergy = Math.max(-1, Math.min(1, (raw - frameAverage) / spread));
      var targetOffset = normalized > 0.025
        ? relativeEnergy * 46
        : 0;
      var currentOffset = renderedOffsets[i] || 0;
      var easing = Math.abs(targetOffset) > Math.abs(currentOffset) ? 0.27 : 0.12;
      var offset = currentOffset + (targetOffset - currentOffset) * easing;
      renderedOffsets[i] = offset;
      // Give interior points a small, data-derived horizontal offset. This
      // prevents the line from reading as an evenly spaced template while
      // retaining the underlying frequency order.
      var x = i * (100 / (pointCount - 1));
      if (i > 0 && i < pointCount - 1) {
        x += relativeEnergy * 0.52;
      }
      energy += normalized;
      points.push(x.toFixed(2) + ',' + (50 + offset).toFixed(2));
    }
    waveform.setAttribute('points', points.join(' '));
    var averageEnergy = energy / pointCount;
    waveform.style.opacity = (0.58 + Math.min(0.42, averageEnergy * 0.8)).toFixed(3);
    waveform.style.filter = averageEnergy > 0.48 ? 'brightness(1.18)' : 'none';
    if (shell) shell.style.setProperty('--music-energy', Math.min(1, averageEnergy).toFixed(3));
  }

  function resetWaveform() {
    if (!waveform) return;
    renderedOffsets = [];
    waveform.setAttribute('points', '0,50 100,50');
    waveform.style.opacity = '0.42';
    waveform.style.filter = 'none';
    if (shell) shell.style.setProperty('--music-energy', '0');
  }

  function stopFallback() {
    if (fallbackTimer) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function startFallback() {
    if (fallbackTimer) return;

    fallbackTimer = window.setInterval(function() {
      var playing = isPlaying();
      setPlayingState(playing);
      setFallbackMode(true);

      if (!playing) {
        resetWaveform();
        return;
      }

      var values = [];
      for (var i = 0; i < pointCount; i++) {
        var wave = 0.24 + Math.abs(Math.sin(Date.now() / 210 + i * 0.62)) * 0.5;
        var jitter = Math.random() * 0.18;
        values.push(Math.min(1, wave + jitter));
      }

      renderWaveformFromValues(values, 1);
    }, 120);
  }

  function stopSpectrumRender() {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  }

  function renderSpectrumFrame() {
    if (!analyser || !frequencyData || !connectedAudio) {
      resetWaveform();
      return;
    }

    if (connectedAudio.paused) {
      setPlayingState(false);
      resetWaveform();
      animationFrameId = window.requestAnimationFrame(renderSpectrumFrame);
      return;
    }

    setPlayingState(true);
    setFallbackMode(false);
    analyser.getByteFrequencyData(frequencyData);

    var bucketSize = Math.max(1, Math.floor(frequencyData.length / pointCount));
    var values = [];
    var totalEnergy = 0;
    for (var i = 0; i < pointCount; i++) {
      var sum = 0;
      for (var j = 0; j < bucketSize; j++) {
        sum += frequencyData[i * bucketSize + j] || 0;
      }
      var avg = sum / bucketSize;
      totalEnergy += avg;
      values.push(avg);
    }

    if (!shouldSkipDetectionPause(connectedAudio) && connectedAudio.currentTime > 1.5) {
      if (totalEnergy < 30) {
        silentTicks += 1;
      } else {
        silentTicks = 0;
      }

      if (silentTicks >= 12) {
        setStatus('Silent track detected, skipping...');
        skipBrokenTrack();
        return;
      }
    } else {
      silentTicks = 0;
    }

    renderWaveformFromValues(values, 255);
    animationFrameId = window.requestAnimationFrame(renderSpectrumFrame);
  }

  function getPlayerRoot() {
    return document.querySelector('#music-player-wrap .aplayer')
      || document.querySelector('.aplayer');
  }

  function ensureAudioContextResumed() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(function() {});
    }
  }

  function bindResumeGuards() {
    var playerRoot = getPlayerRoot();
    if (!playerRoot || playerRoot.dataset.visualizerResumeBound === 'true') return;

    var resume = function() {
      ensureAudioContextResumed();
    };

    playerRoot.addEventListener('click', resume, { passive: true });
    playerRoot.addEventListener('pointerdown', resume, { passive: true });
    playerRoot.dataset.visualizerResumeBound = 'true';
  }

  function getMetingInstance() {
    var meting = document.querySelector('#music-player-wrap meting-js')
      || document.querySelector('meting-js');
    if (meting && meting.aplayer) return meting.aplayer;
    return null;
  }

  function getAudioElement() {
    var instance = getMetingInstance();
    if (instance && instance.audio) return instance.audio;

    return document.querySelector('#music-player-wrap .aplayer audio')
      || document.querySelector('.aplayer audio')
      || null;
  }

  function getCurrentTitle() {
    var playerRoot = getPlayerRoot();
    if (!playerRoot) return '';
    var title = playerRoot.querySelector('.aplayer-title');
    return title ? title.textContent.trim() : '';
  }

  function isPlaying() {
    var audio = getAudioElement();
    if (audio) return !audio.paused;

    var playerRoot = getPlayerRoot();
    return !!(playerRoot && playerRoot.classList.contains('aplayer-playing'));
  }

  function bindAudioEvents(audio) {
    if (!audio || boundAudio === audio) return;
    boundAudio = audio;

    audio.addEventListener('play', function() {
      extendSkipGrace(2500);
      var title = getCurrentTitle();
      setStatus(title ? 'Now playing: ' + title : 'Now playing');
      ensureAudioContextResumed();
      stopFallback();
      stopSpectrumRender();
      renderSpectrumFrame();
    });

    audio.addEventListener('pause', function() {
      extendSkipGrace(4000);
      resetAutoSkipCounters();
      setStatus('Paused');
      setPlayingState(false);
      resetWaveform();
    });

    audio.addEventListener('ended', function() {
      extendSkipGrace(2500);
      resetAutoSkipCounters();
      setStatus('Playback ended');
      setPlayingState(false);
      resetWaveform();
    });

    audio.addEventListener('loadedmetadata', function() {
      extendSkipGrace(4000);
      resetAutoSkipCounters();
    });

    audio.addEventListener('loadstart', function() {
      extendSkipGrace(5000);
      resetAutoSkipCounters();
      stopFallback();
      resetWaveform();
      setStatus('Loading track...');
    });

    audio.addEventListener('waiting', function() {
      extendSkipGrace(4000);
    });

    audio.addEventListener('seeking', function() {
      extendSkipGrace(4000);
      resetAutoSkipCounters();
    });

    audio.addEventListener('seeked', function() {
      extendSkipGrace(2500);
      resetAutoSkipCounters();
    });

    audio.addEventListener('canplay', function() {
      extendSkipGrace(2000);
    });

    audio.addEventListener('error', function() {
      setStatus('Track load failed, skipping...');
      skipBrokenTrack();
    });
  }

  function skipBrokenTrack() {
    if (skipCooldown) return;
    skipCooldown = true;

    var instance = getMetingInstance();
    if (instance) {
      try {
        if (typeof instance.skipForward === 'function') {
          instance.skipForward();
        } else if (typeof instance.switch === 'function' && instance.list && Array.isArray(instance.list.audios)) {
          var currentIndex = instance.list.index || 0;
          var nextIndex = (currentIndex + 1) % instance.list.audios.length;
          instance.switch(nextIndex);
          if (typeof instance.play === 'function') {
            instance.play();
          }
        }
      } catch (error) {}
    }

    window.setTimeout(function() {
      skipCooldown = false;
      extendSkipGrace(2500);
      resetAutoSkipCounters();
    }, 2500);
  }

  function connectRealSpectrum(audio) {
    if (!audio) return false;
    if (connectedAudio === audio && analyser) return true;

    try {
      if (!audio.crossOrigin) {
        audio.crossOrigin = 'anonymous';
      }

      if (!audioContext) {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          setStatus('Web Audio unsupported, using fallback');
          startFallback();
          return false;
        }
        audioContext = new AudioContextClass();
      }

      if (connectedAudio !== audio) {
        if (sourceNode) {
          try {
            sourceNode.disconnect();
          } catch (error) {}
        }
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;

        sourceNode = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        connectedAudio = audio;
      }

      bindAudioEvents(audio);
      bindResumeGuards();
      spectrumBlocked = false;
      if (!audio.paused && audioContext.state === 'suspended') {
        ensureAudioContextResumed();
      }

      if (audioContext.state === 'suspended') {
        setStatus('Tap player once to enable real spectrum');
        startFallback();
        return false;
      }

      setStatus('Real audio spectrum connected');
      stopFallback();
      stopSpectrumRender();
      renderSpectrumFrame();
      return true;
    } catch (error) {
      spectrumBlocked = true;
      setFallbackMode(true);
      setStatus('CORS blocked real spectrum, using animated fallback');
      startFallback();
      return false;
    }
  }

  function syncState() {
    if (!shell) return;

    var playerRoot = getPlayerRoot();
    var audio = getAudioElement();
    var title = getCurrentTitle();

    if (audio) {
      connectRealSpectrum(audio);

      if (!shouldSkipDetectionPause(audio)) {
        if (audio.currentTime === lastCurrentTime && audio.readyState < 3) {
          stalledTicks += 1;
        } else if (Math.abs(audio.currentTime - lastCurrentTime) < 0.01 && audio.currentTime === 0 && audio.networkState === 2) {
          stalledTicks += 1;
        } else {
          stalledTicks = 0;
        }

        lastCurrentTime = audio.currentTime;

        if (stalledTicks >= 8) {
          setStatus('Track stalled, skipping...');
          skipBrokenTrack();
          return;
        }
      } else {
        resetAutoSkipCounters();
      }

      if (!audio.paused) {
        if (spectrumBlocked) {
          setStatus(title ? 'Fallback active: ' + title : 'Fallback active');
        } else {
          setStatus(title ? 'Now playing: ' + title : 'Now playing');
        }
        setPlayingState(true);
      } else {
        if (spectrumBlocked) {
          setStatus(title ? 'Ready with fallback: ' + title : 'Ready with fallback');
        } else {
          setStatus(title ? 'Ready: ' + title : 'Player ready');
        }
        setPlayingState(false);
      }
      return;
    }

    if (playerRoot) {
      setStatus('Player mounted, waiting for audio...');
      resetWaveform();
      return;
    }

    setStatus('Waiting for player...');
  }

  mountTimer = window.setInterval(function() {
    if (createVisualizer()) {
      window.clearInterval(mountTimer);
      mountTimer = null;
      setStatus('Visualizer injected');
      resetWaveform();
      playerPollTimer = window.setInterval(syncState, 400);
      syncState();
    }
  }, 300);

  window.setTimeout(function() {
    if (!shell && mountTimer) {
      setStatus('Music player mount timeout');
    }
  }, 15000);
});
