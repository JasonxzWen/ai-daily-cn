# Modified by Harness Hub: use semantic locators and user-visible readiness.
from playwright.sync_api import sync_playwright

# Example: Capturing console logs during browser automation

url = 'http://localhost:5173'  # Replace with your URL

console_logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Set up console log capture
    def handle_console_message(msg):
        console_logs.append(f"[{msg.type}] {msg.text}")
        print(f"Console: [{msg.type}] {msg.text}")

    page.on("console", handle_console_message)

    # Navigate, then wait for the visible result of the interaction.
    page.goto(url)
    page.get_by_role('link', name='Dashboard').click()
    page.get_by_role('heading', name='Dashboard').wait_for()

    browser.close()

# Save console logs to file
with open('/mnt/user-data/outputs/console.log', 'w') as f:
    f.write('\n'.join(console_logs))

print(f"\nCaptured {len(console_logs)} console messages")
print(f"Logs saved to: /mnt/user-data/outputs/console.log")
