(() => {
  const app = document.getElementById('qa-app');
  if (!app) return;
  const api = app.dataset.api.replace(/\/$/, '');
  const form = document.getElementById('qa-form');
  const textarea = document.getElementById('qa-question');
  const result = document.getElementById('qa-result');
  const answerBox = document.getElementById('qa-answer');
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  document.getElementById('qa-count').textContent = `${textarea.value.length} / 2000`;
  textarea.addEventListener('input', () => { document.getElementById('qa-count').textContent = `${textarea.value.length} / 2000`; });

  const token = new URLSearchParams(location.hash.slice(1)).get('key');
  if (token) {
    form.hidden = true;
    result.textContent = '正在读取专属回答…';
    fetch(`${api}/api/answer?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (res) => { if (!res.ok) throw new Error('链接无效或问题不存在。'); return res.json(); })
      .then((data) => {
        result.textContent = '';
        document.getElementById('qa-question-view').textContent = data.question;
        document.getElementById('qa-answer-view').textContent = data.answer || '还没有回答，请稍后再通过此链接查看。';
        answerBox.hidden = false;
      })
      .catch((err) => { result.textContent = `${err.message} 请确认使用完整的专属链接。`; });
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    result.textContent = '正在发送…';
    try {
      const res = await fetch(`${api}/api/questions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: textarea.value, website: form.elements.website.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === 'question_length' ? '问题长度需为 2–2000 个字符。' : '发送失败，请稍后重试。');
      const link = `${location.origin}${location.pathname}#key=${encodeURIComponent(data.token)}`;
      result.innerHTML = `<p>问题已私密提交。请保存下面的专属链接，丢失后无法找回：</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><button class="qa-button" id="qa-copy" type="button">复制专属链接</button>`;
      document.getElementById('qa-copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(link);
        document.getElementById('qa-copy').textContent = '已复制';
      });
      form.reset();
      document.getElementById('qa-count').textContent = '0 / 2000';
    } catch (err) { result.textContent = err.message || '网络错误，请稍后重试。'; }
    finally { button.disabled = false; }
  });
})();
