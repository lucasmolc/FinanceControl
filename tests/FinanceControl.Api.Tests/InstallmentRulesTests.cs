using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Regras puras de parcelamento e de leitura de fatura/extrato (v1.4).</summary>
public sealed class InstallmentRulesTests
{
    private static DateOnly D(string iso) => DateOnly.ParseExact(iso, "yyyy-MM-dd");

    [Fact]
    public void ValorPorParcelaMultiplicaParaOTotal()
    {
        Assert.Equal(1_000_00, InstallmentRules.TotalOf(100_00, 10));
    }

    [Theory]
    // Divisão exata.
    [InlineData(1_000_00, 10, 1, 100_00)]
    [InlineData(1_000_00, 10, 10, 100_00)]
    // Resto de 1 centavo na primeira parcela.
    [InlineData(100_00, 3, 1, 33_34)]
    [InlineData(100_00, 3, 2, 33_33)]
    [InlineData(100_00, 3, 3, 33_33)]
    // Resto de 2 centavos nas duas primeiras.
    [InlineData(10_01, 3, 1, 3_34)]
    [InlineData(10_01, 3, 2, 3_34)]
    [InlineData(10_01, 3, 3, 3_33)]
    public void RateioDoTotalPorParcela(long total, int count, int number, long expected)
    {
        Assert.Equal(expected, InstallmentRules.AmountOf(total, count, number));
    }

    [Theory]
    [InlineData(100_00, 3)]
    [InlineData(10_01, 3)]
    [InlineData(1_000_00, 10)]
    [InlineData(7, 7)]
    public void SomaDasParcelasFechaOTotal(long total, int count)
    {
        var series = InstallmentRules.Series(D("2026-09-17"), 1, count, total);
        Assert.Equal(total, series.Sum(item => item.AmountCents));
        Assert.All(series, item => Assert.True(item.AmountCents > 0));
    }

    [Theory]
    // 6/10 hoje: 5 parcelas atrás e 4 à frente, sempre no mesmo dia do mês.
    [InlineData("2026-09-17", 6, 1, "2026-04-17")]
    [InlineData("2026-09-17", 6, 10, "2027-01-17")]
    // Dia limitado ao tamanho do mês, sempre a partir do dia informado (31/01 → 28/02 → 31/03).
    [InlineData("2026-01-31", 1, 2, "2026-02-28")]
    [InlineData("2026-01-31", 1, 3, "2026-03-31")]
    [InlineData("2028-01-31", 1, 2, "2028-02-29")]
    public void DataDaParcelaDeslocaOMes(string anchor, int anchorNumber, int number, string expected)
    {
        Assert.Equal(D(expected), InstallmentRules.DateOf(D(anchor), anchorNumber, number));
    }

    [Theory]
    [InlineData(1, false)]
    [InlineData(2, true)]
    [InlineData(72, true)]
    [InlineData(73, false)]
    public void TotalDeParcelasTemLimite(int count, bool valid) => Assert.Equal(valid, InstallmentRules.IsValidCount(count));

    [Fact]
    public void TotalPrecisaDeUmCentavoPorParcela()
    {
        Assert.False(InstallmentRules.FitsTotal(9, 10));
        Assert.True(InstallmentRules.FitsTotal(10, 10));
    }
}

public sealed class StatementRulesTests
{
    [Theory]
    // Português: ponto de milhar e vírgula decimal.
    [InlineData("1.234,56", 123456L)]
    [InlineData("R$ 1.234,56", 123456L)]
    [InlineData("-12,90", -1290L)]
    [InlineData("R$ -5.195,80", -519580L)]
    [InlineData("- R$ 12,90", -1290L)]
    [InlineData("12,90-", -1290L)]
    [InlineData("(12,90)", -1290L)]
    [InlineData("12,9", 1290L)]
    // Inglês.
    [InlineData("1,234.56", 123456L)]
    [InlineData("1234.56", 123456L)]
    [InlineData("-1234.56", -123456L)]
    // Separador único com 3 dígitos é milhar, não decimal.
    [InlineData("1.234", 123400L)]
    [InlineData("1,234", 123400L)]
    [InlineData("1.234.567", 123456700L)]
    // Sem separador.
    [InlineData("1234", 123400L)]
    [InlineData("0", 0L)]
    public void ValorEmCentavos(string text, long expected) => Assert.Equal(expected, StatementRules.ParseAmountCents(text));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("abc")]
    [InlineData(null)]
    public void ValorInvalidoEhNulo(string? text) => Assert.Null(StatementRules.ParseAmountCents(text));

    [Theory]
    [InlineData("2026-09-17", "2026-09-17")]
    [InlineData("17/09/2026", "2026-09-17")]
    [InlineData("17/09/26", "2026-09-17")]
    [InlineData("17-09-2026", "2026-09-17")]
    [InlineData("17.09.2026", "2026-09-17")]
    [InlineData("20260917", "2026-09-17")]
    // OFX: data com hora e fuso.
    [InlineData("20260917120000[-3:BRT]", "2026-09-17")]
    public void DataDoArquivo(string text, string expected) =>
        Assert.Equal(DateOnly.ParseExact(expected, "yyyy-MM-dd"), StatementRules.ParseDate(text));

    [Theory]
    [InlineData("17/13/2026")]
    [InlineData("")]
    [InlineData("nada")]
    public void DataInvalidaEhNula(string text) => Assert.Null(StatementRules.ParseDate(text));

    [Theory]
    [InlineData(100L, AmountConvention.DebitPositive, "expense")]
    [InlineData(-100L, AmountConvention.DebitPositive, "income")]
    [InlineData(100L, AmountConvention.CreditPositive, "income")]
    [InlineData(-100L, AmountConvention.CreditPositive, "expense")]
    public void SentidoDoValor(long signed, AmountConvention convention, string kind) =>
        Assert.Equal(kind, StatementRules.KindOf(signed, convention));

    [Theory]
    [InlineData("NETFLIX 6/10", 6, 10)]
    [InlineData("NOTEBOOK PARC 06/10", 6, 10)]
    [InlineData("CURSO parcela 2 de 12", 2, 12)]
    public void ParcelaNaDescricao(string description, int number, int count) =>
        Assert.Equal((number, count), StatementRules.Installment(description));

    [Theory]
    // Data no meio da descrição não é parcela.
    [InlineData("PAGAMENTO 17/09 SUPERMERCADO")]
    // Fora do limite de parcelas.
    [InlineData("COMPRA 1/1")]
    [InlineData("COMPRA 11/10")]
    [InlineData("SEM PARCELA")]
    public void DescricaoSemParcela(string description) => Assert.Null(StatementRules.Installment(description));

    [Theory]
    [InlineData("•••• 1234", "1234")]
    [InlineData("XXXX-1234", "1234")]
    [InlineData("1234", "1234")]
    [InlineData("4111 1111 1111 1234", "1234")]
    [InlineData("123", null)]
    [InlineData("", null)]
    public void UltimosDigitosDoCartao(string text, string? expected) => Assert.Equal(expected, StatementRules.CardDigits(text));

    [Fact]
    public void DescricaoEmUmaLinhaComLimite()
    {
        Assert.Equal("SUPERMERCADO SAO JOSE", StatementRules.CleanDescription("  SUPERMERCADO\t SAO  JOSE \n"));
        Assert.Equal(StatementRules.MaxDescription, StatementRules.CleanDescription(new string('a', 300)).Length);
    }
}
