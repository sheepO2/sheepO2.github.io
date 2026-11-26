(() => {
  const root = document.getElementById('qa-admin');
  if (!root) return;
  const api = root.dataset.api.replace(/\/$/, '');
  const form = document.getElementById('qa-admin-login');
  const output = document.getElementById('qa-admin-result');
  const list = document.getElementById('qa-admin-list');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = document.getElementById('qa-admin-token').value;
    output.textContent = '正在载入…';
    list.replaceChildren();
    try {
      const res = await fetch(`${api}/api/admin/questions`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      if (res.status === 401) throw new Error('管理员密钥不正确。');
      if (!res.ok) throw new Error('读取问题失败，请稍后重试。');
      const data = await res.json();
      output.textContent = data.questions.length ? `有 ${data.questions.length} 个待回答问题。` : '目前没有待回答问题。';

      for (const item of data.questions) {
        const card = document.createElement('section');
        card.className = 'qa-card';
        const question = document.createElement('p');
        question.textContent = item.question;
        const date = document.createElement('small');
        date.textContent = new Date(item.created_at).toLocaleString();
        const answer = document.createElement('textarea');
        answer.rows = 4;
        answer.maxLength = 5000;
        answer.placeholder = '写下回答';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'qa-button';
        button.textContent = '提交回答';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const saved = await fetch(`${api}/api/answer`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id: item.id, answer: answer.value })
            });
            if (!saved.ok) throw new Error(saved.status === 401 ? '管理员密钥失效，请重新载入。' : '提交失败，请重试。');
            card.remove();
            output.textContent = '回答已保存。提问者打开原专属链接即可查看。';
          } catch (err) {
            output.textContent = err.message || '网络错误，请检查 Worker。';
            button.disabled = false;
          }
        });
        card.append(question, date, answer, button);
        list.append(card);
      }
    } catch (err) {
      output.textContent = err.message || '网络错误，请检查 Worker。';
    }
  });
})();
