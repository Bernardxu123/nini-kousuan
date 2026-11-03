const task = await taskSpace("debug grade console errors");
const page = task.page("p1");

page.on("console", msg => console.log(`[Browser ${msg.type()}]:`, msg.text()));
page.on("pageerror", err => console.log(`[Browser Uncaught Error]:`, err.message));

console.log("Navigating to https://learn.290490.xyz/grade.html ...");
await page.goto("https://learn.290490.xyz/grade.html", { timeout: 30000 });
await page.waitForTimeout(4000);

const html = await page.evaluate(() => {
  return {
    title: document.querySelector('#sheetTitle').innerText,
    meta: document.querySelector('#sheetMetaText').innerText,
    cells: document.querySelectorAll('#matrixGrid .matrix-cell').length
  };
});
console.log("Result:", html);

await task.finish({ keep: [] });
