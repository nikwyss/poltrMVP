export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">EID-PROTO</h1>
        <p className="text-lg text-gray-600 mb-6">
          Swiss E-ID to ATProto Verification Bridge
        </p>

        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-blue-900 mb-2">What is this?</h2>
          <p className="text-blue-800 text-sm">
            This service verifies ATProto accounts using Swiss E-ID (SWIYU). It
            writes a signed verification record to your PDS, proving you are a
            Swiss resident.
          </p>
        </div>

        <div className="text-left bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-3">API Usage</h3>
          <p className="text-sm text-gray-600 mb-2">
            POST to <code className="bg-gray-200 px-1 rounded">/api/verify/initiate</code> with:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside mb-4">
            <li>Authorization header with PDS bearer token</li>
            <li>Body: refresh_token, pds_url, success_url, error_url</li>
          </ul>
          <p className="text-sm text-gray-600">
            Or redirect users to <code className="bg-gray-200 px-1 rounded">/verify</code> with query
            parameters.
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Powered by SWIYU Swiss E-ID
      </p>
    </main>
  );
}
