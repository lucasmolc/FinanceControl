namespace FinanceControl.Application.Common;

public enum OperationStatus { Success, NotFound, ValidationError }

public sealed record OperationResult<T>(OperationStatus Status, T? Value = default, IReadOnlyDictionary<string, string[]>? Errors = null)
{
    public bool IsSuccess => Status == OperationStatus.Success;
    public static OperationResult<T> Success(T value) => new(OperationStatus.Success, value);
    public static OperationResult<T> NotFound() => new(OperationStatus.NotFound);
    public static OperationResult<T> Invalid(string field, string error) => new(OperationStatus.ValidationError, default, new Dictionary<string, string[]>(StringComparer.Ordinal) { [field] = [error] });
    public static OperationResult<T> Invalid(IReadOnlyDictionary<string, string[]> errors) => new(OperationStatus.ValidationError, default, errors);

    /// <summary>Propaga um resultado sem sucesso (não encontrado ou inválido) para outro tipo de valor.</summary>
    public OperationResult<TOther> Failure<TOther>() => IsSuccess
        ? throw new InvalidOperationException("Resultado de sucesso não pode ser propagado como falha.")
        : new OperationResult<TOther>(Status, default, Errors);
}
