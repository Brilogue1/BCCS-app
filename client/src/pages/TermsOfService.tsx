export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <img src="/bccs-logo.png" alt="BCCS Logo" className="h-10 w-10" />
          <div>
            <div className="font-bold text-slate-900 text-lg leading-tight">BCCS Client Portal</div>
            <div className="text-xs text-slate-500">Building Consulting & Certification Services</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">

          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service &amp; Email Policy</h1>
          <p className="text-slate-500 text-sm mb-8">Last updated: July 2026 &nbsp;·&nbsp; BCCS LLC &nbsp;·&nbsp; <a href="mailto:info@bccsfl.com" className="text-blue-600 hover:underline">info@bccsfl.com</a></p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. About This Portal</h2>
            <p className="text-slate-600 leading-relaxed">
              The BCCS Client Portal (<strong>app.bccsfl.com</strong>) is a private web application operated by
              Building Consulting &amp; Certification Services LLC ("BCCS," "we," "us," or "our"). It is provided
              exclusively to clients, contractors, and authorized personnel who have been issued login credentials
              by BCCS. Access is not open to the general public.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Email Communications</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              By using this portal, you consent to receive transactional and operational email notifications
              related to your building inspection projects. These emails are sent solely for the purpose of
              keeping you informed about your active work with BCCS. We do not send marketing or promotional
              emails through this system.
            </p>
            <p className="text-slate-600 leading-relaxed mb-3">Examples of emails you may receive include:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 ml-2">
              <li>Confirmation that an inspection has been <strong>scheduled</strong> on your behalf</li>
              <li>Notification that an inspection has been <strong>completed</strong> or <strong>approved</strong></li>
              <li>Notification that an inspection was <strong>denied or partially approved</strong>, including any notes from the inspector</li>
              <li>Alerts when a new <strong>inspection report (PDF)</strong> has been generated and is available in your portal</li>
              <li>Reminders about <strong>upcoming required inspections</strong> for your permit</li>
              <li>Account-related messages such as <strong>password resets</strong> or login credential updates</li>
              <li>Important updates about your <strong>project stage</strong> (e.g., moving from Permitting to Inspections)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. How We Use Your Email Address</h2>
            <p className="text-slate-600 leading-relaxed">
              Your email address is used only to deliver the transactional notifications described above. We do
              not sell, rent, or share your email address with third parties for marketing purposes. Your contact
              information is stored securely and used solely in connection with your active projects managed
              through the BCCS system.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Opting Out</h2>
            <p className="text-slate-600 leading-relaxed">
              Because these emails are operational notifications tied directly to your active inspection projects,
              they are not optional while your projects are in progress. If you believe you are receiving emails
              in error, or if your project has concluded and you wish to be removed from our system, please
              contact us at{" "}
              <a href="mailto:info@bccsfl.com" className="text-blue-600 hover:underline">info@bccsfl.com</a>{" "}
              and we will promptly address your request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Acceptable Use</h2>
            <p className="text-slate-600 leading-relaxed">
              You agree to use this portal only for its intended purpose — managing and tracking your building
              inspection projects with BCCS. You may not share your login credentials, attempt to access
              accounts belonging to other users, or use this portal in any way that violates applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Data &amp; Privacy</h2>
            <p className="text-slate-600 leading-relaxed">
              Project data displayed in this portal is sourced from BCCS internal systems and is provided for
              informational purposes. BCCS takes reasonable steps to protect the security of your account and
              project data. You are responsible for keeping your login credentials confidential.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Changes to These Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              We may update these terms from time to time. Continued use of the portal after any changes
              constitutes acceptance of the revised terms. The "Last updated" date at the top of this page
              reflects when the most recent changes were made.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have any questions about these terms or our email practices, please reach out:
            </p>
            <div className="mt-3 bg-slate-50 rounded-lg p-4 text-slate-700 text-sm space-y-1">
              <div><strong>BCCS LLC</strong></div>
              <div>Building Consulting &amp; Certification Services</div>
              <div>
                Email:{" "}
                <a href="mailto:info@bccsfl.com" className="text-blue-600 hover:underline">info@bccsfl.com</a>
              </div>
              <div>
                Website:{" "}
                <a href="https://bccsfl.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">bccsfl.com</a>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-6 py-6 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} BCCS LLC. All rights reserved.
      </footer>
    </div>
  );
}
