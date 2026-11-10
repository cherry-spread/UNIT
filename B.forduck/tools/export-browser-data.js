// Run in the original forduckapp.vercel.app tab's developer console.
// Read only: downloads a local JSON file, with no network requests or data changes.
(() => {
  if (location.origin !== 'https://forduckapp.vercel.app') {
    throw new Error('원본 https://forduckapp.vercel.app 페이지에서 실행하세요.');
  }
  const storage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('podeok.')) storage[key] = localStorage.getItem(key);
  }
  const backup = { origin: location.origin, exportedAt: new Date().toISOString(), storage };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'forduck-browser-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.info(`포덕 저장 항목 ${Object.keys(storage).length}개를 파일로 내보냈습니다.`);
})();
