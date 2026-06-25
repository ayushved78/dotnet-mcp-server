using MCP.Core.DotnetCliService;
using MCP.Core.Services;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;

namespace RisingTideAI.Trade.MCP.Host.MCPServers;

[McpServerToolType]
public sealed class DotnetCommandTools(
    IDotnetCliService cli,
    IProjectEnvironmentService envService,
    IProjectConfigService projectConfig)
{
    private static readonly JsonSerializerOptions _json = new() { WriteIndented = true };
    private static readonly HashSet<string> _valuedFlags = ["--target", "--page", "--page-size", "--timeout"];

    [McpServerTool]
    [Description(
        "Builds a project and/or runs/restarts it as a live HTTP server.\n\n" +
        "COMMANDS:\n" +
        "  build          — dotnet clean+build, returns Roslyn diagnostics\n" +
        "  run            — build then stop/start the app; polls until reachable; use http_request after\n" +
        "  add-package    — dotnet add package <id> [version]\n\n" +
        "FLAGS (all commands):\n" +
        "  --no-clean     skip clean, ~5x faster (incremental). Start with full build first.\n" +
        "  --target <p>   explicit .sln/.csproj path relative to project root\n\n" +
        "FLAGS (build only):\n" +
        "  --warnings     include warnings in output\n" +
        "  --page <n>     diagnostic page (default 1)\n" +
        "  --page-size <n>\n\n" +
        "FLAGS (run only):\n" +
        "FLAGS (run only):\n" +
        "  --timeout <s>  seconds to wait for app to come up (default 120)\n\n" +
        "run RETURNS: buildSuccess, buildSummary, diagnostics, appStarted, appUrl, runStatus, totalDurationMs\n" +
        "  runStatus values: started | restarted | build_failed | launch_failed | timeout\n" +
        "build RETURNS: success, summary, totalDiagnostics, diagnostics[]")]
    public async Task<string> ExecuteDotnetCommand(
        string projectName,
        string command,
        string[]? args = null)
    {
        args ??= [];
        var target          = ExtractFlag(args, "--target");
        var pageStr         = ExtractFlag(args, "--page");
        var pageSizeStr     = ExtractFlag(args, "--page-size");
        var timeoutStr      = ExtractFlag(args, "--timeout");
        var includeWarnings = args.Any(a => a.Equals("--warnings",  StringComparison.OrdinalIgnoreCase));
        var noClean         = args.Any(a => a.Equals("--no-clean",  StringComparison.OrdinalIgnoreCase));
        var page            = int.TryParse(pageStr,     out var p) ? p : 1;
        var pageSize        = int.TryParse(pageSizeStr, out var s) ? s : 50;
        var timeout         = int.TryParse(timeoutStr,  out var t) ? t : 120;

        object result = command.ToLowerInvariant() switch
        {
            "build"       => await cli.BuildAsync(projectName, target, page, pageSize, includeWarnings, clean: !noClean),
            "run"         => await HandleRun(projectName, target, !noClean, timeout),
            "add-package" => await HandleAddPackage(projectName, args),
            _             => throw new ArgumentException(
                $"Unknown command '{command}'. Supported: build, run, add-package")
        };

        return JsonSerializer.Serialize(result, _json);
    }

    // ── run ───────────────────────────────────────────────────────────────────

    private async Task<AppRunResult> HandleRun(
        string projectName, string? target, bool clean, int timeoutSeconds)
    {
        // Resolve project ID (GUID) from name
        var entry = projectConfig.LoadProjects().Projects
            .FirstOrDefault(p => p.Name.Equals(projectName, StringComparison.OrdinalIgnoreCase))
            ?? throw new KeyNotFoundException(
                $"Project '{projectName}' not found. Use get_project_skeleton('*') to list projects.");

        var env = await envService.GetDefaultEnvironmentAsync(entry.Id)
                  ?? throw new InvalidOperationException(
                      $"No environment configured for project '{projectName}'. " +
                      "Add one via the dotnetmcp UI (Settings → Environments) before using 'run'.");

        return await cli.RunAsync(projectName, env.BaseUrl, target, clean, timeoutSeconds);
    }

    // ── add-package ───────────────────────────────────────────────────────────

    private Task<DotnetCommandResult> HandleAddPackage(string projectName, string[] args)
    {
        var filtered = FilterFlagArgs(args);
        if (filtered.Length == 0)
            throw new ArgumentException("add-package requires args[0] = PackageId.");
        var packageId = filtered[0].Trim();
        var version   = filtered.Length > 1 ? filtered[1].Trim() : null;
        return cli.AddPackageAsync(projectName, packageId, version);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static string? ExtractFlag(string[] args, string flag)
    {
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i].Equals(flag, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        return null;
    }

    private static string[] FilterFlagArgs(string[] args)
    {
        var result = new List<string>();
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i].Equals("--warnings",  StringComparison.OrdinalIgnoreCase)) continue;
            if (args[i].Equals("--no-clean",  StringComparison.OrdinalIgnoreCase)) continue;
            if (_valuedFlags.Contains(args[i], StringComparer.OrdinalIgnoreCase))
            { i++; continue; }
            result.Add(args[i]);
        }
        return [.. result];
    }
}

