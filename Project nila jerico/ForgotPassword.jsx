import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const API_URL = "http://localhost:3000";

export function ForgotPassword() {
  const [currentStage, setCurrentStage] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Stage 1: Send reset code
  const handleSendCode = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        throw new Error("Please enter your email address.");
      }

      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to send reset code.");
      }

      setCurrentStage("code");
      toast.success("Code sent!", {
        description: "Check your email for the reset code.",
      });
    } catch (err) {
      setError(err.message);
      toast.error("Error", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Stage 2: Verify code and move to password
  const handleVerifyCode = (e) => {
    e.preventDefault();
    setError("");

    if (!code || code.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setCurrentStage("password");
  };

  // Stage 3: Reset password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }

      const trimmedEmail = email.trim().toLowerCase();
      const res = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          code: code,
          newPassword: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password.");
      }

      toast.success("Success!", {
        description: "Your password has been reset. Please log in.",
      });
      navigate("/login");
    } catch (err) {
      setError(err.message);
      toast.error("Error", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => {
    setError("");
    if (currentStage === "code") {
      setCurrentStage("email");
      setCode("");
    } else if (currentStage === "password") {
      setCurrentStage("code");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  // Stage 1: Email Input
  if (currentStage === "email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2">Reset Your Password</h1>
          <p className="text-sm text-gray-600 mb-6">
            Enter your email address and we'll send you a reset code.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSendCode}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="your@email.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Stage 2: Code Verification
  if (currentStage === "code") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <button
            onClick={goBack}
            className="text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft size={24} />
          </button>

          <h1 className="text-2xl font-bold text-center mb-6">RESET YOUR PASSWORD</h1>

          <div className="mb-6 p-4 bg-green-100 border border-green-400 rounded">
            <div className="flex gap-2">
              <span className="text-xl text-green-700">✓</span>
              <div>
                <p className="font-semibold text-green-700">We've sent a reset code to</p>
                <p className="text-sm text-green-600">{email}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-600 mb-4">
            Enter the 6-digit code we just sent to your email address.
          </p>

          <form onSubmit={handleVerifyCode}>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Verification Code
            </label>
            <div className="flex justify-between gap-2 mb-6">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  type="text"
                  inputMode="numeric"
                  maxLength="1"
                  value={code[index] || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val) {
                      const codeArray = code.split("");
                      codeArray[index] = val;
                      const newCode = codeArray.join("").slice(0, 6);
                      setCode(newCode);

                      if (index < 5) {
                        const inputs = document.querySelectorAll("input[maxLength='1']");
                        inputs[index + 1]?.focus();
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !code[index] && index > 0) {
                      const inputs = document.querySelectorAll("input[maxLength='1']");
                      inputs[index - 1]?.focus();
                    }
                  }}
                  className="w-12 h-12 border-2 border-gray-300 rounded-lg text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              ))}
            </div>

            <button
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg mb-4"
            >
              Verify Code
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Didn't receive the code?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStage("email");
                    setCode("");
                  }}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Resend Code
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Stage 3: New Password
  if (currentStage === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <button
            onClick={goBack}
            className="text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft size={24} />
          </button>

          <h1 className="text-2xl font-bold text-center mb-6">RESET YOUR PASSWORD</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-600 mb-6">
            Enter your new password below.
          </p>

          <form onSubmit={handleResetPassword}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Enter new password"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Confirm new password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg mb-4 disabled:opacity-50"
            >
              {isLoading ? "Resetting..." : "Reset Password"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}