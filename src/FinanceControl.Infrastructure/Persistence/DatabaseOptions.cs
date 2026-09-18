namespace FinanceControl.Infrastructure.Persistence;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";
    public string Path { get; init; } = "data/finance.db";
}
