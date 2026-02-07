/**
 * Type-level tests for the Infer utility type and invoke() signature.
 *
 * These tests verify that `Infer<typeof cmd>` correctly extracts the
 * handler args type from a Command instance, and that invoke() requires
 * the right fields (required options/args mandatory, defaults optional).
 */

import { describe, expectTypeOf, test } from "vitest";
import { o, f, a, command, type Infer } from "../../src/command";
import type { CommandContext } from "../../src/command";

describe("Infer", () => {
  test("infers options and args from a root command", () => {
    const serve = command("serve", {
      description: "Start server",
      options: {
        port: o.number().default(3000),
        host: o.string(),
        open: f(),
      },
      args: [a.string().name("entry")] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type ServeArgs = Infer<typeof serve>;

    expectTypeOf<ServeArgs>().toEqualTypeOf<{
      port: number;
      host: string | undefined;
      open: boolean;
      entry: string;
    }>();
  });

  test("infers empty object for command with no options or args", () => {
    const ping = command("ping", {
      description: "Ping",
      handler: () => ({ stdout: "pong", stderr: "", exitCode: 0 }),
    });

    type PingArgs = Infer<typeof ping>;

    expectTypeOf<PingArgs>().toEqualTypeOf<{}>();
  });

  test("infers required options without undefined", () => {
    const deploy = command("deploy", {
      description: "Deploy",
      options: {
        target: o.string().required(),
        replicas: o.number().default(1),
        dryRun: f(),
      },
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type DeployArgs = Infer<typeof deploy>;

    expectTypeOf<DeployArgs>().toEqualTypeOf<{
      target: string;
      replicas: number;
      dryRun: boolean;
    }>();
  });

  test("infers variadic args as arrays", () => {
    const rm = command("rm", {
      description: "Remove files",
      options: {
        force: f(),
      },
      args: [a.string().name("files").variadic()] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type RmArgs = Infer<typeof rm>;

    expectTypeOf<RmArgs>().toEqualTypeOf<{
      force: boolean;
      files: string[];
    }>();
  });

  test("infers optional args with undefined", () => {
    const cmd = command("cmd", {
      description: "Test",
      args: [
        a.string().name("required"),
        a.string().name("optional").optional(),
      ] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type CmdArgs = Infer<typeof cmd>;

    expectTypeOf<CmdArgs>().toEqualTypeOf<{
      required: string;
      optional: string | undefined;
    }>();
  });

  test("infers inherited options on subcommands", () => {
    const root = command("root", {
      description: "Root",
      options: {
        verbose: f(),
      },
    });

    const child = root.command("child", {
      description: "Child",
      options: {
        output: o.string().required(),
      },
      args: [a.string().name("file")] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type ChildArgs = Infer<typeof child>;

    expectTypeOf<ChildArgs>().toEqualTypeOf<{
      verbose: boolean;
      output: string;
      file: string;
    }>();
  });

  test("infers deeply inherited options", () => {
    const root = command("root", { description: "Root" });

    const cloud = root.command("cloud", {
      description: "Cloud",
      options: {
        region: o.string().default("us-east-1"),
        profile: o.string(),
      },
    });

    const storage = cloud.command("storage", {
      description: "Storage",
      options: {
        bucket: o.string().required(),
      },
    });

    const upload = storage.command("upload", {
      description: "Upload",
      options: {
        public: f(),
      },
      args: [
        a.string().name("source"),
        a.string().name("destination").optional(),
      ] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type UploadArgs = Infer<typeof upload>;

    expectTypeOf<UploadArgs>().toEqualTypeOf<{
      region: string;
      profile: string | undefined;
      bucket: string;
      public: boolean;
      source: string;
      destination: string | undefined;
    }>();
  });

  test("respects omitInherited", () => {
    const root = command("root", {
      description: "Root",
      options: {
        verbose: f(),
        debug: f(),
      },
    });

    const child = root.command("child", {
      description: "Child",
      omitInherited: ["debug"],
      options: {
        output: o.string().required(),
      },
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type ChildArgs = Infer<typeof child>;

    expectTypeOf<ChildArgs>().toEqualTypeOf<{
      verbose: boolean;
      output: string;
    }>();
  });

  test("infers group command (no handler, no args)", () => {
    const root = command("root", { description: "Root" });

    const db = root.command("db", {
      description: "Database",
      options: {
        connectionString: o.string(),
        schema: o.string().default("public"),
      },
    });

    type DbArgs = Infer<typeof db>;

    expectTypeOf<DbArgs>().toEqualTypeOf<{
      connectionString: string | undefined;
      schema: string;
    }>();
  });
});

// ============================================================================
// invoke() signature — required fields mandatory, defaulted/optional fields optional
// ============================================================================

describe("invoke() signature", () => {
  test("requires required options, makes defaulted/optional/flags optional", () => {
    const deploy = command("deploy", {
      description: "Deploy",
      options: {
        target: o.string().required(),
        replicas: o.number().default(1),
        env: o.string(),
        dryRun: f(),
      },
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    // First arg to invoke
    type InvokeArgs = Parameters<typeof deploy.invoke>[0];

    // target is required (no default, no undefined) → mandatory
    expectTypeOf<InvokeArgs>().toExtend<{ target: string }>();

    // replicas has default → optional
    // env is string | undefined → optional
    // dryRun is a flag → optional
    expectTypeOf<{ target: "prod" }>().toExtend<InvokeArgs>();
  });

  test("requires required positional args, makes defaulted/optional args optional", () => {
    const cmd = command("cmd", {
      description: "Test",
      args: [
        a.string().name("source"),
        a.string().name("dest").optional(),
        a.string().name("mode").default("copy"),
      ] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type InvokeArgs = Parameters<typeof cmd.invoke>[0];

    // source is required → mandatory
    expectTypeOf<InvokeArgs>().toExtend<{ source: string }>();

    // dest is optional, mode has default → both optional
    expectTypeOf<{ source: "a.txt" }>().toExtend<InvokeArgs>();
  });

  test("inherited required options are required in invoke", () => {
    const root = command("root", { description: "Root" });

    const storage = root.command("storage", {
      description: "Storage",
      options: {
        bucket: o.string().required(),
        region: o.string().default("us-east-1"),
      },
    });

    const upload = storage.command("upload", {
      description: "Upload",
      args: [a.string().name("source")] as const,
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type InvokeArgs = Parameters<typeof upload.invoke>[0];

    // bucket (inherited, required) and source (arg, required) → mandatory
    expectTypeOf<InvokeArgs>().toExtend<{ bucket: string; source: string }>();

    // region has default → optional
    expectTypeOf<{ bucket: "bkt", source: "file.txt" }>().toExtend<InvokeArgs>();
  });

  test("empty invoke args when all fields have defaults or are optional", () => {
    const cmd = command("cmd", {
      description: "Test",
      options: {
        port: o.number().default(3000),
        verbose: f(),
        host: o.string(),
      },
      handler: (args) => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    type InvokeArgs = Parameters<typeof cmd.invoke>[0];

    // All optional — empty object should be valid
    expectTypeOf<{}>().toExtend<InvokeArgs>();
  });
});
