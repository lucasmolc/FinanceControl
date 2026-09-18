using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace FinanceControl.Application.Security;

/// <summary>
/// Hash de senha PBKDF2-HMAC-SHA256 com sal aleatório (recomendação OWASP: 600.000 iterações). Formato armazenado:
/// <c>pbkdf2-sha256$iterações$sal$hash</c> (Base64), o que permite aumentar as iterações sem invalidar hashes antigos.
/// </summary>
public static class PasswordHasher
{
    private const string Algorithm = "pbkdf2-sha256";
    private const int Iterations = 600_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return string.Join('$', Algorithm, Iterations.ToString(CultureInfo.InvariantCulture), Convert.ToBase64String(salt), Convert.ToBase64String(hash));
    }

    /// <summary>Compara em tempo constante; formato desconhecido ou corrompido nunca confere.</summary>
    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != Algorithm) return false;
        if (!int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var iterations) || iterations < 1) return false;
        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }
        var actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
