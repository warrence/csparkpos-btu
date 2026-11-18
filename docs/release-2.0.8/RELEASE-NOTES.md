# Corrected CSparkPOS 2.0.8/code8 candidate

This separate directory replaces the HELD artifact in csparkpos-release-2.0.8 (SHA256 dac62241b2c0743fb03ff2f38eaf6ab02b3bbf673cb657e631d93032093ef028). Never distribute that held APK. Final candidate identity is in RELEASE_RESULT.json and SHA256SUMS.txt here.

Historical PA uploaded markers are NOT accepted as proof of Office acceptance. Old clients could set them after unconditional HTTP200 despite item failure. Those receipts remain visible, labeled "Previously marked uploaded - verify with Office", and are not automatically archived or silently requeued. Office review is required. Exact new per-receipt acknowledgments still archive safely and retain full duplicate evidence. This does not mean all previously uploaded receipts disappear.

New confirmed OP, PA and coupon uploads are archived atomically with their owned details and outbox cleanup; AN uses its separate exact acknowledgments. Historical AN posted cleanup retains the existing strict timestamp, payload, identity and uncertainty checks. Pending, ambiguous and incomplete records remain. Historical OP/coupon/MBill success is never inferred. Uploaded archives cannot restore into the posting queue; manually removed unposted receipts remain recoverable. No payment acceptance/vehicle-matching change.

## Verification and provenance
- Exact frozen final candidate: 687 tests / 51 suites PASS in 34.862 seconds, including five version parity/negative checks.
- 13 final cleanup manifest paths and 155 frozen files verified.
- Revised 18 native Realm checks use final receiptRemoval99bd620f…, paReceiptsc35a5a56…, safePostingd7acff2f…. Actual old 2.0.4 compiled fake-HTTP200 proof retains the false-success PA marker. All42 native fixture libraries matched.
- Earlier 20 native checks are superseded for historical PA cleanup; do not present them as final behavior.
- Earlier 8 client HTTP cases/35 assertions predate the historical PA correction (receiptRemovalfc0a…). They support unchanged posting/retry behavior, not exact final-tree verification. Revised native checks plus final regression cover the correction.
- 19 backend posting/Process Payment checks remain supporting evidence for unchanged deployed Office tree5bc2d4edb80d1321b2e39b8f3aa940e9707a8373. QA PHP8.4 differs from live8.1.27.

## Upgrade and limits
Same com.csparkpos signing certificate, increasing code8, production endpoint https://office.bdap.com.my, non-debuggable. Visible/package/Android versions2.0.8 are synchronized and actual compiled Login/Dashboard consumption checked. Schema remains32, identical to2.0.7. In-place upgrade only; do not uninstall/clear data. Do not downgrade to2.0.6 after schema32 use.
No device installation, launch, real customer data, live posting, Office changes, upload, sharing or publication performed. Physical UI/printer behavior remains untested. Native final tests use mocked HTTP; earlier HTTP tests use test-double storage. Public distribution unchanged, no upload retry. Removed credential/helper protection inherited from sanitized2.0.7 with scoped module comparison; no legacy secret reread.
