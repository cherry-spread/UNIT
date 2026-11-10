const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');

function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
}

menuButton.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
});

navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});

document.querySelectorAll('[data-dialog]').forEach(trigger => {
  const dialog = document.getElementById(trigger.dataset.dialog);
  trigger.addEventListener('click', event => {
    event.preventDefault();
    dialog.showModal();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
});

const form = document.querySelector('#inquiry-form');
const status = document.querySelector('#inquiry-status');
const submit = form.querySelector('button[type="submit"]');
let submissionId;

form.addEventListener('input', () => {
  submissionId = undefined;
  status.textContent = '';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const { project, email, brief, website } = Object.fromEntries(new FormData(form));
  if (!brief.trim()) {
    status.textContent = '만들고 싶은 것을 입력해 주세요.';
    form.elements.brief.focus();
    return;
  }

  submit.disabled = true;
  status.textContent = '문의 내용을 접수하는 중입니다.';
  submissionId ??= crypto.randomUUID();
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: submissionId, project, email, brief, website }),
    });
    const result = await response.json();
    if (!response.ok || !result.received) {
      status.textContent = result.error || '접수에 실패했습니다. 다시 시도해 주세요.';
      return;
    }
    form.reset();
    submissionId = undefined;
    status.textContent = '문의가 접수되었습니다.';
  } catch {
    status.textContent = '접수 상태를 확인할 수 없습니다. 다시 시도해 주세요.';
  } finally {
    submit.disabled = false;
  }
});
