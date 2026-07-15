export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const expected = process.env.TEACHER_PASSCODE;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "missing_teacher_passcode" });
  }

  const passcode = req.body?.passcode;
  if (typeof passcode !== "string" || passcode !== expected) {
    return res.status(401).json({ ok: false, error: "invalid_passcode" });
  }

  return res.status(200).json({ ok: true });
}
