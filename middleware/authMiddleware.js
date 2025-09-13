import jwt from "jsonwebtoken";
import User from "../models/User.js"; // Don't forget .js in ESM

function authMiddleware(requiredRole = null, allowedContexts = []) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token missing" });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-passwordHash");
      if (!user) return res.status(401).json({ error: "User not found" });

      // Check user role
      if (requiredRole) {
        const allowedRoles = Array.isArray(requiredRole)
          ? requiredRole
          : [requiredRole];
        if (!allowedRoles.includes(user.role)) {
          return res
            .status(403)
            .json({ error: "Access forbidden: insufficient rights" });
        }
      }

      // Check calling context
      if (allowedContexts.length > 0) {
        const callerContext = req.headers["x-app-context"]?.toLowerCase();
        const matched = allowedContexts.includes(callerContext);

        if (!matched) {
          return res
            .status(403)
            .json({ error: "Access forbidden: invalid access context" });
        }
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export default authMiddleware;
