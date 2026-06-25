// Thin command relay. commands.onCommand fires in the worker, not the content
// script, so we forward it to the active tab. No resolver state lives here.
export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'jump-to-def') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await browser.tabs.sendMessage(tab.id, { type: 'jump-to-def' });
    }
  });
});
