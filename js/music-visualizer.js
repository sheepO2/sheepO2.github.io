window.addEventListener('DOMContentLoaded', function() {
  if (!location.pathname.startsWith('/music')) return;

  var mountTimer = null;
  var playerPollTimer = null;
  var fallbackTimer = null;
  var shell = null;
  var bars = [];
  var statusNode = null;
  var audioContext = null;
  var analyser = null;
  var frequencyData = null;
  var sourceNode = null;
  var connectedAudio = null;
  var animationFrameId = 0;
  var audioBound = false;
  var spectrumBlocked = false;

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
      '  <div class="music-footer-visualizer__bars" id="music-footer-spectrum"></div>',
      '  <div class="music-footer-visualizer__glow"></div>',
      '</div>'
    ].join('');

    playerWrap.parentNode.insertBefore(shell, playerWrap);

    statusNode = shell.querySelector('#music-footer-visualizer-status');
    var barsRoot = shell.querySelector('#music-footer-spectrum');

    for (var i = 0; i < 28; i++) {
      var bar = document.createElement('span');
      bar.className = 'music-footer-visualizer__bar';
      bar.style.transform = 'scaleY(0.12)';
      bar.style.opacity = '0.45';
      barsRoot.appendChild(bar);
      bars.push(bar);
    }

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

  function renderBarsFromValues(values, maxValue) {
    for (var i = 0; i < bars.length; i++) {
      var raw = values[i] || 0;
      var normalized = Math.max(0.08, raw / maxValue);
      var scale = Math.min(1, normalized);
      var opacity = Math.min(1, 0.35 + scale * 0.65);
      bars[i].style.transform = 'scaleY(' + scale.toFixed(3) + ')';
      bars[i].style.opacity = opacity.toFixed(3);
      bars[i].style.filter = scale > 0.68 ? 'brightness(1.08)' : 'none';
    }
  }

  function resetBars() {
    for (var i = 0; i < bars.length; i++) {
      bars[i].style.transform = 'scaleY(0.12)';
      bars[i].style.opacity = '0.45';
      bars[i].style.filter = 'none';
    }
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
        resetBars();
        return;
      }

      var values = [];
      for (var i = 0; i < bars.length; i++) {
        var wave = 0.24 + Math.abs(Math.sin(Date.now() / 210 + i * 0.62)) * 0.5;
        var jitter = Math.random() * 0.18;
        values.push(Math.min(1, wave + jitter));
      }

      renderBarsFromValues(values, 1);
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
      startFallback();
      return;
    }

    if (connectedAudio.paused) {
      setPlayingState(false);
      resetBars();
      animationFrameId = window.requestAnimationFrame(renderSpectrumFrame);
      return;
    }

    setPlayingState(true);
    setFallbackMode(false);
    analyser.getByteFrequencyData(frequencyData);

    var bucketSize = Math.max(1, Math.floor(frequencyData.length / bars.length));
    var values = [];
    for (var i = 0; i < bars.length; i++) {
      var sum = 0;
      for (var j = 0; j < bucketSize; j++) {
        sum += frequencyData[i * bucketSize + j] || 0;
      }
      values.push(sum / bucketSize);
    }

    renderBarsFromValues(values, 255);
    animationFrameId = window.requestAnimationFrame(renderSpectrumFrame);
  }

  function getPlayerRoot() {
    return document.querySelector('#music-player-wrap .aplayer')
      || document.querySelector('.aplayer');
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
    if (!audio || audioBound) return;
    audioBound = true;

    audio.addEventListener('play', function() {
      var title = getCurrentTitle();
      setStatus(title ? 'Now playing: ' + title : 'Now playing');
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(function() {});
      }
      stopFallback();
      stopSpectrumRender();
      renderSpectrumFrame();
    });

    audio.addEventListener('pause', function() {
      setStatus('Paused');
      setPlayingState(false);
      resetBars();
    });

    audio.addEventListener('ended', function() {
      setStatus('Playback ended');
      setPlayingState(false);
      resetBars();
    });
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
      spectrumBlocked = false;
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
      if (isPlaying()) {
        startFallback();
      }
      return;
    }

    setStatus('Waiting for player...');
  }

  mountTimer = window.setInterval(function() {
    if (createVisualizer()) {
      window.clearInterval(mountTimer);
      mountTimer = null;
      setStatus('Visualizer injected');
      startFallback();
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
