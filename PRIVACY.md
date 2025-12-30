# Privacy Policy for HA Boks Extension

**Last Updated:** December 30, 2025

This Privacy Policy describes how the **HA Boks Extension** ("we", "our", or "the extension") handles your data. We are committed to protecting your privacy and ensuring transparency.

## 1. Data Collection and Usage

**We do not collect, store, or share any of your personal data on our servers.**

The extension operates entirely locally within your browser and communicates directly with your self-hosted **Home Assistant** instance.

### A. Configuration Data
The extension stores the following information locally in your browser's storage (`chrome.storage.local` / `sync`) solely for the purpose of functioning:
- **Home Assistant URL:** To know where to send API requests.
- **Access Token:** To authenticate with your Home Assistant instance.
- **Entity ID:** The ID of the Todo list used to manage parcel codes.

This data never leaves your browser except to communicate directly with your specified Home Assistant URL.

### B. Parcel Data
When you generate a code, the description you enter is sent directly to your Home Assistant instance via its API. We do not have access to this data.

## 2. Permissions

The extension requests the minimum permissions necessary to function:
- **Host Permissions (`http://*/*`, `https://*/*`):** Required to communicate with your custom Home Assistant URL (which can be any domain or IP) and to insert codes into e-commerce websites.
- **Scripting:** Required to insert the generated code into the active text field on a web page.
- **Context Menus:** Required to add the "Generate Boks Code" option to your browser's right-click menu.

## 3. Third-Party Services

The extension communicates exclusively with:
- **Your Home Assistant Instance:** The extension acts as a client for your own server. Please refer to Home Assistant's privacy policy regarding how your data is handled on your server.

We do not use any tracking tools, analytics (like Google Analytics), or advertising networks.

## 4. Changes to This Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## 5. Contact Us

If you have any questions about this Privacy Policy, please contact us via our GitHub repository:
[https://github.com/thib3113/boks](https://github.com/thib3113/boks)
