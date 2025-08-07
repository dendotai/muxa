import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-gray-600 mb-4">Page not found</p>
        <p className="text-sm text-gray-500">
          Looking for muxa docs? Visit{" "}
          <Link href="/muxa" className="text-blue-600 hover:underline">
            /muxa
          </Link>
        </p>
      </div>
    </div>
  );
}
