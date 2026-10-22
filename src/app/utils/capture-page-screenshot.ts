/**
 * Capture the main app surface with html2canvas and download as PNG.
 * Tries common selectors so share works across layout shells.
 */
export async function capturePageScreenshot(downloadBasename: string): Promise<void> {
  const selectors = ['main', 'app-player-search', '.min-h-screen'];
  let mainContent: HTMLElement | null = null;
  for (const sel of selectors) {
    mainContent = document.querySelector(sel) as HTMLElement | null;
    if (mainContent) break;
  }
  if (!mainContent) {
    mainContent = document.body;
  }
  if (!mainContent) {
    throw new Error('Unable to find content to capture');
  }

  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(mainContent, {
    background: '#0f172a',
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0,
    width: mainContent.scrollWidth,
    height: mainContent.scrollHeight,
  } as any);

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) {
        reject(new Error('Failed to capture screenshot'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${downloadBasename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}
