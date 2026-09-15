# Macrotech v0.10.1-online-alpha.1 — Local online transport candidate

Read START_HERE.md, ONLINE_TRANSPORT_ALPHA.md and WINDOWS_MANUAL_TESTS.md first.
This is source plus the compiled React dashboard and Windows builder, not a
prebuilt or signed Windows executable. It has configurable test transport source but is not deployed or connected to cloud or email.

Build only in a separate folder and use synthetic data with the network
disabled. Only a successful Windows build creates READY_TO_TEST. Settings →
About must show 0.10.1-online-alpha.1.

This release uses separate local data and document folders. Do not copy old
runtime databases or credentials into it. Email sending remains disabled, the
live 2026 Tracker remains blocked from writes, and no production system was
modified. Windows/WebView2 and connected staging tests remain release gates.
