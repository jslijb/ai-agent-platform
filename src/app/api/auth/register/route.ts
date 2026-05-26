import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "用户名不能为空"),
  password: z
    .string()
    .min(8, "密码至少8位")
    .regex(/[A-Z]/, "密码必须包含至少一个大写字母")
    .regex(/[a-z]/, "密码必须包含至少一个小写字母")
    .regex(/[0-9]/, "密码必须包含至少一个数字")
    .regex(/[^A-Za-z0-9]/, "密码必须包含至少一个特殊字符"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = registerSchema.safeParse(body);

    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(", ");
      return NextResponse.json(
        { message: errors },
        { status: 400 }
      );
    }

    const { email, name, password } = validated.data;

    const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existingUser) {
      return NextResponse.json(
        { message: "该邮箱已被注册" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      email,
      name,
      password: hashedPassword,
    });

    return NextResponse.json(
      { message: "注册成功" },
      { status: 201 }
    );
  } catch (error) {
    console.error("注册失败:", error);
    return NextResponse.json(
      { message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
