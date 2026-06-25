namespace MCP.Core.DotnetCliService;

public record DotnetDiagnostic
{
    public required string Severity { get; init; }  // error | warning
    public string? Code    { get; init; }            // CS0246
    public string? File    { get; init; }            // relative path
    public int?    Line    { get; init; }
    public int?    Column  { get; init; }
    public required string Message { get; init; }
}

public record DotnetCommandResult
{
    public required bool          Success          { get; init; }
    public required string        Command          { get; init; }
    public required long          DurationMs       { get; init; }
    public required string        Summary          { get; init; }
    public string?                ResolvedTarget   { get; init; }
    public List<string>?          AvailableTargets { get; init; }

    // Diagnostics — always present, paginated
    public List<DotnetDiagnostic> Diagnostics      { get; init; } = [];
    public int                    TotalDiagnostics { get; init; }
    public int                    Page             { get; init; } = 1;
    public int                    PageSize         { get; init; } = 50;
    public int                    TotalPages       { get; init; }
}

/// <summary>Result of a build+run operation.</summary>
public record AppRunResult
{
    public required bool   BuildSuccess  { get; init; }
    public required string BuildSummary  { get; init; }
    public List<DotnetDiagnostic> Diagnostics { get; init; } = [];
    public int             TotalDiagnostics { get; init; }

    // Run phase (only populated when BuildSuccess=true)
    public bool?   AppStarted    { get; init; }   // null = not attempted
    public string? AppUrl        { get; init; }
    public string? RunStatus     { get; init; }   // "started" | "restarted" | "build_failed" | "timeout"
    public long    TotalDurationMs { get; init; }
}

public interface IDotnetCliService
{
    Task<DotnetCommandResult> BuildAsync(
        string projectName,
        string? buildTarget = null,
        int page = 1,
        int pageSize = 50,
        bool includeWarnings = false,
        bool clean = true,
        CancellationToken ct = default);

    Task<DotnetCommandResult> AddPackageAsync(string projectName, string packageId, string? version, CancellationToken ct = default);

    /// <summary>
    /// Build then stop/start the project as a background dotnet run process.
    /// Kills any previously launched process for this project before starting a new one.
    /// Polls the app's health URL (from the project's default environment) until reachable or timeout.
    /// </summary>
    Task<AppRunResult> RunAsync(
        string projectName,
        string appUrl,
        string? buildTarget = null,
        bool clean = true,
        int healthTimeoutSeconds = 120,
        CancellationToken ct = default);
}


