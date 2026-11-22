# 30-second demo capture (steps)

Setup: Chrome profile with Gemini Nano available (see README), extension loaded
unpacked from dist-dev (so cloud works with the debug token), and a test page
with a text box (or ChatGPT) open.

1. (0-4s) Click in the text box. Focus it and type: "Hi, my email is
   mona.adel@example.com and rent is EGP 8,500."
2. (4-8s) Click the Envoy toolbar icon, switch **Envoy on this site** on,
   accept Chrome's permission prompt. Reload the tab.
3. (8-14s) Focus the text box again and click the **Envoy** toggle: the green
   ring locks on. The findings card lists [EMAIL] and [AMOUNT].
4. (14-20s) Click **Apply to field**. The field now holds the masked text.
   Send it as you normally would.
5. (20-26s) Click **Upload with Envoy** beside a file input, choose a text
   file with an email in it, see the findings and the receipt, click
   **Send this file to the site**.
6. (26-30s) Open the Envoy side panel: show the Privacy Flight Recorder and
   the restored answer. End frame: "Ask the cloud. Keep your secrets."
