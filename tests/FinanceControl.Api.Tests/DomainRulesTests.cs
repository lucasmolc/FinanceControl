using FinanceControl.Application.Validation;
using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class DomainRulesTests
{
    [Theory]
    [InlineData("income", 1000, 1000)]
    [InlineData("expense", 1000, -1000)]
    [InlineData("investment", 1000, -1000)]
    public void Transaction_delta_follows_kind(string kind, long amount, long expected) =>
        Assert.Equal(expected, TransactionRules.BalanceDelta(kind, amount));

    [Fact]
    public void Transaction_delta_rejects_unknown_kind() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TransactionRules.BalanceDelta("gift", 10));

    [Theory]
    [InlineData("deposit", 500, 500, 500)]
    [InlineData("withdrawal", 500, -417, -500)]
    [InlineData("yield", 500, 0, 500)]
    [InlineData("adjustment", 1500, 0, 300)]
    public void Investment_movement_produces_expected_delta(string kind, long amount, long invested, long current)
    {
        var delta = InvestmentRules.Movement(kind, amount, new InvestmentPosition(1000, 1200));
        Assert.Equal(new InvestmentDelta(invested, current), delta);
    }

    [Fact]
    public void Investment_position_detects_negative_results()
    {
        var position = new InvestmentPosition(100, 100);
        Assert.False(position.Apply(InvestmentRules.Movement("withdrawal", 200, position)).IsValid);
        Assert.True(position.Revert(new InvestmentDelta(50, 60)).IsValid);
        Assert.False(position.Revert(new InvestmentDelta(150, 0)).IsValid);
    }

    [Fact]
    public void Investment_recorded_delta_prefers_stored_values_and_derives_legacy_ones()
    {
        Assert.Equal(new InvestmentDelta(1, 2), InvestmentRules.RecordedDelta("adjustment", 999, 1, 2));
        Assert.Equal(new InvestmentDelta(10, 10), InvestmentRules.RecordedDelta("deposit", 10, null, null));
        Assert.Equal(new InvestmentDelta(-10, -10), InvestmentRules.RecordedDelta("withdrawal", 10, null, null));
        Assert.Equal(new InvestmentDelta(0, 10), InvestmentRules.RecordedDelta("yield", 10, null, null));
        Assert.Null(InvestmentRules.RecordedDelta("adjustment", 10, null, null));
    }

    [Theory]
    [InlineData("deposit", 300, 1000, 300)]
    [InlineData("transfer_in", 300, 1000, 300)]
    [InlineData("withdrawal", 300, 1000, -300)]
    [InlineData("transfer_out", 300, 1000, -300)]
    [InlineData("adjustment", -200, 1000, -1200)]
    public void Bank_movement_delta(string kind, long amount, long balance, long expected) =>
        Assert.Equal(expected, BankRules.Movement(kind, amount, balance));

    [Fact]
    public void Bank_reversal_requires_known_delta()
    {
        Assert.Equal(-50, BankRules.ReversibleDelta("adjustment", 1000, -50));
        Assert.Equal(100, BankRules.ReversibleDelta("deposit", 100, null));
        Assert.Equal(-100, BankRules.ReversibleDelta("withdrawal", 100, null));
        Assert.Null(BankRules.ReversibleDelta("transfer_out", 100, null));
        Assert.Null(BankRules.ReversibleDelta("adjustment", 100, null));
        Assert.Equal(-100, BankRules.DisplayDelta("transfer_out", 100, null));
        Assert.Null(BankRules.DisplayDelta("adjustment", 100, null));
    }

    [Fact]
    public void Goal_rules_add_and_revert()
    {
        Assert.Equal(1500, GoalRules.Apply(1000, "contribution", 500));
        Assert.Equal(500, GoalRules.Apply(1000, "withdrawal", 500));
        Assert.Equal(-500, GoalRules.Revert(0, "contribution", 500));
        Assert.Equal(500, GoalRules.Revert(0, "withdrawal", 500));
        Assert.Throws<ArgumentOutOfRangeException>(() => GoalRules.Delta("gift", 1));
        Assert.Equal(["contribution", "withdrawal"], FinanceEnums.GoalEntryKinds.Order());
    }

    [Theory]
    [InlineData(10000, 10500, 2000, 1905)]   // 1904,76 → 1905
    [InlineData(1000, 3000, 1500, 500)]      // exatamente metade
    [InlineData(1, 2, 1, 1)]                 // 0,5 arredonda para cima
    [InlineData(1, 3, 1, 0)]                 // 0,33 arredonda para baixo
    [InlineData(5000, 4000, 4000, 5000)]     // resgate total zera o aplicado mesmo com prejuízo
    [InlineData(0, 700, 300, 0)]             // só rendimento: aplicado continua zero
    [InlineData(800, 0, 300, 300)]           // saldo atual zero: reduz pelo próprio valor
    [InlineData(200, 0, 300, 200)]           // ... sem passar do aplicado
    public void Investment_withdrawal_reduces_invested_by_average_cost(long invested, long current, long amount, long expectedReduction)
    {
        var position = new InvestmentPosition(invested, current);
        Assert.Equal(expectedReduction, InvestmentRules.AverageCostReduction(amount, position));
        Assert.Equal(new InvestmentDelta(-expectedReduction, -amount), InvestmentRules.Movement("withdrawal", amount, position));
    }

    [Fact]
    public void Investment_average_cost_handles_large_values_without_overflow()
    {
        var position = new InvestmentPosition(4_000_000_000_000_000, 8_000_000_000_000_000);
        Assert.Equal(2_000_000_000_000_000, InvestmentRules.AverageCostReduction(4_000_000_000_000_000, position));
    }

    [Fact]
    public void Enum_sets_match_the_contract()
    {
        Assert.Equal(8, FinanceEnums.PaymentMethods.Count);
        Assert.Contains("auto_debit", FinanceEnums.PaymentMethods);
        Assert.Equal(["amex", "elo", "hipercard", "mastercard", "other", "visa"], FinanceEnums.CardNetworks.Order());
        Assert.Equal(5, FinanceEnums.AccountTypes.Count);
        Assert.Equal(6, FinanceEnums.GoalTypes.Count);
        Assert.Equal(8, FinanceEnums.InvestmentTypes.Count);
        Assert.Contains("real_estate_funds", FinanceEnums.InvestmentTypes);
        Assert.Equal(["monthly", "weekly", "yearly"], FinanceEnums.SubscriptionFrequencies.Order());
    }

    [Fact]
    public void Validator_normalizes_and_collects_references()
    {
        var result = InputValidator.Validate(ModuleSchemas.Records["transactions"], new Dictionary<string, object?>
        {
            ["date"] = " 2026-01-02 ",
            ["description"] = "  Café  ",
            ["kind"] = "expense",
            ["amount_cents"] = 350L,
            ["category_id"] = 7L,
            ["account_id"] = null,
            ["notes"] = "   "
        }, ValidationMode.Create);

        Assert.True(result.IsSuccess);
        var input = result.Value!;
        Assert.Equal("2026-01-02", input.Text("date"));
        Assert.Equal("Café", input.Text("description"));
        Assert.Null(input.Values["notes"]);
        Assert.Null(input.Values["account_id"]);
        Assert.Equal(new ReferenceCheck("category_id", ReferenceTarget.Category, 7), Assert.Single(input.References));
    }
}
