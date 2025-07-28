import { describe, it, expect } from "bun:test";
import { needsShellWrapping } from "../../../src/command-builder";

describe("needsShellWrapping", () => {
  describe("Shell operators", () => {
    it("should detect && operator", () => {
      expect(needsShellWrapping("echo hello && echo world")).toBe(true);
    });

    it("should detect || operator", () => {
      expect(needsShellWrapping("echo hello || echo world")).toBe(true);
    });

    it("should detect pipe operator", () => {
      expect(needsShellWrapping("echo hello | grep world")).toBe(true);
    });

    it("should detect semicolon", () => {
      expect(needsShellWrapping("echo hello; echo world")).toBe(true);
    });

    it("should detect background operator", () => {
      expect(needsShellWrapping("npm start &")).toBe(true);
    });
  });

  describe("Glob patterns", () => {
    it("should detect asterisk glob", () => {
      expect(needsShellWrapping("ls *.js")).toBe(true);
    });

    it("should detect question mark glob", () => {
      expect(needsShellWrapping("ls file?.txt")).toBe(true);
    });

    it("should detect bracket glob", () => {
      expect(needsShellWrapping("ls [abc]*.js")).toBe(true);
    });

    it("should detect brace expansion", () => {
      expect(needsShellWrapping("echo {a,b,c}.txt")).toBe(true);
    });
  });

  describe("Environment variables", () => {
    it("should detect simple env var", () => {
      expect(needsShellWrapping("echo $HOME")).toBe(true);
    });

    it("should detect braced env var", () => {
      expect(needsShellWrapping("echo ${HOME}")).toBe(true);
    });

    it("should detect env var in path", () => {
      expect(needsShellWrapping("cd $HOME/projects")).toBe(true);
    });
  });

  describe("Command substitution", () => {
    it("should detect backtick substitution", () => {
      expect(needsShellWrapping("echo `date`")).toBe(true);
    });

    it("should detect $() substitution", () => {
      expect(needsShellWrapping("echo $(pwd)")).toBe(true);
    });

    it("should detect nested substitution", () => {
      expect(needsShellWrapping("echo $(echo $(date))")).toBe(true);
    });
  });

  describe("Subshells", () => {
    it("should detect simple subshell", () => {
      expect(needsShellWrapping("(cd src && npm install)")).toBe(true);
    });

    it("should detect subshell in command", () => {
      expect(needsShellWrapping("echo hello && (cd src; ls)")).toBe(true);
    });
  });

  describe("Tilde expansion", () => {
    it("should detect tilde at start", () => {
      expect(needsShellWrapping("~/scripts/test.sh")).toBe(true);
    });

    it("should detect tilde after space", () => {
      expect(needsShellWrapping("cd ~/projects")).toBe(true);
    });

    it("should detect tilde in PATH-like syntax", () => {
      expect(needsShellWrapping("PATH=~/bin:$PATH")).toBe(true);
    });

    it("should not detect tilde in middle of word", () => {
      expect(needsShellWrapping("echo test~file")).toBe(false);
    });
  });

  describe("Escaped characters", () => {
    it("should detect escaped dollar", () => {
      expect(needsShellWrapping("echo \\$HOME")).toBe(true);
    });

    it("should detect escaped space", () => {
      expect(needsShellWrapping("echo hello\\ world")).toBe(true);
    });

    it("should detect escaped quotes", () => {
      expect(needsShellWrapping('echo \\"hello\\"')).toBe(true);
    });
  });

  describe("Quotes", () => {
    it("should detect single quotes", () => {
      expect(needsShellWrapping("echo 'hello world'")).toBe(true);
    });

    it("should detect double quotes", () => {
      expect(needsShellWrapping('echo "hello world"')).toBe(true);
    });

    it("should detect mixed quotes", () => {
      expect(needsShellWrapping("echo \"hello\" 'world'")).toBe(true);
    });
  });

  describe("Redirections", () => {
    it("should detect output redirection", () => {
      expect(needsShellWrapping("echo hello > output.txt")).toBe(true);
    });

    it("should detect append redirection", () => {
      expect(needsShellWrapping("echo hello >> output.txt")).toBe(true);
    });

    it("should detect input redirection", () => {
      expect(needsShellWrapping("wc -l < input.txt")).toBe(true);
    });

    it("should detect stderr redirection", () => {
      expect(needsShellWrapping("npm test 2> errors.log")).toBe(true);
    });

    it("should detect stderr to stdout", () => {
      expect(needsShellWrapping("npm test 2>&1")).toBe(true);
    });

    it("should detect &> redirection", () => {
      expect(needsShellWrapping("npm test &> output.log")).toBe(true);
    });

    it("should detect numbered file descriptors", () => {
      expect(needsShellWrapping("exec 3>&1")).toBe(true);
    });
  });

  describe("Here documents", () => {
    it("should detect here doc with <<", () => {
      expect(needsShellWrapping("cat << EOF")).toBe(true);
    });

    it("should detect here doc with <<-", () => {
      expect(needsShellWrapping("cat <<- EOF")).toBe(true);
    });

    it("should detect here doc with custom delimiter", () => {
      expect(needsShellWrapping("cat << DELIMITER")).toBe(true);
    });
  });

  describe("Simple commands", () => {
    it("should not wrap npm commands", () => {
      expect(needsShellWrapping("npm run dev")).toBe(false);
    });

    it("should not wrap simple executables", () => {
      expect(needsShellWrapping("node index.js")).toBe(false);
    });

    it("should not wrap commands with flags", () => {
      expect(needsShellWrapping("ls -la")).toBe(false);
    });

    it("should not wrap commands with paths", () => {
      expect(needsShellWrapping("./scripts/test.sh")).toBe(false);
    });

    it("should not wrap commands with arguments", () => {
      expect(needsShellWrapping("git commit -m test")).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty command", () => {
      expect(needsShellWrapping("")).toBe(false);
    });

    it("should handle single word", () => {
      expect(needsShellWrapping("ls")).toBe(false);
    });

    it("should handle multiple patterns", () => {
      expect(needsShellWrapping("echo $HOME && ls *.js | grep test")).toBe(true);
    });

    it("should handle complex command", () => {
      expect(needsShellWrapping("FOO=bar npm test > output.log 2>&1 && echo 'done'")).toBe(true);
    });
  });
});
