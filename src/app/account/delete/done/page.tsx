// Where /account/delete lands once the account is gone.

export const metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-6">Your account is deleted</h1>
      <p className="max-w-md text-sm">
        You&apos;re signed out everywhere. If you were using a phone app, close it or sign out there
        too. You can make a new account with the same email any time.
      </p>
    </main>
  );
}
