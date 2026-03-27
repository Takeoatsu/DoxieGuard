/**
 * VPN Certificate Management
 * Auto-Discovery y gestión de certificados para VPNs (OpenVPN, IPsec)
 */

package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// isWindows checks if the current platform is Windows
func isWindows() bool {
	return runtime.GOOS == "windows"
}

// isLinux checks if the current platform is Linux
func isLinux() bool {
	return runtime.GOOS == "linux"
}

// isMac checks if the current platform is macOS
func isMac() bool {
	return runtime.GOOS == "darwin"
}

// VPNConfiguration holds VPN server configuration
type VPNConfiguration struct {
	VPNType       string // "openvpn", "ipsec", "wireguard", "windows-vpn"
	ServerAddress string
	Port          int
	Protocol      string
	CertPath      string
	IsActive      bool
}

// VPNCertificateInfo holds certificate information from VPN
type VPNCertificateInfo struct {
	VPNType      string
	CommonName   string
	ExpiryDate   string
	Fingerprint  string
	SerialNumber string
	IsValid      bool
	IsCA         bool
	Issuer       string
}

// DiscoverOpenVPNCertificates discovers OpenVPN certificates
func DiscoverOpenVPNCertificates() ([]VPNCertificateInfo, error) {
	var certificates []VPNCertificateInfo

	fmt.Println("🔍 [VPN] Descubriendo certificados de OpenVPN...")

	// Common OpenVPN certificate paths
	openvpnPaths := []string{
		"/etc/openvpn",
		"/usr/share/openvpn",
		"/var/log/openvpn",
		"C:\\Program Files\\OpenVPN",
		"C:\\Program Files (x86)\\OpenVPN",
	}

	for _, path := range openvpnPaths {
		certs, err := discoverCertificatesInPath(path)
		if err == nil {
			for _, cert := range certs {
				cert.VPNType = "openvpn"
				certificates = append(certificates, cert)
			}
		}
	}

	// Also check Windows certificate store for OpenVPN certificates
	openvpnCerts, err := discoverOpenVPNWindowsCertificates()
	if err == nil {
		certificates = append(certificates, openvpnCerts...)
	}

	fmt.Printf("✅ [VPN] Encontrados %d certificados de OpenVPN\n", len(certificates))
	return certificates, nil
}

// DiscoverIPSecCertificates discovers IPsec certificates
func DiscoverIPSecCertificates() ([]VPNCertificateInfo, error) {
	var certificates []VPNCertificateInfo

	fmt.Println("🔍 [VPN] Descubriendo certificados de IPsec...")

	// Common IPsec certificate paths
	ipsecPaths := []string{
		"/etc/ipsec.d",
		"/etc/swanctl",
		"/etc/strongswan",
		"C:\\ProgramData\\Microsoft\\Network\\Connections",
	}

	for _, path := range ipsecPaths {
		certs, err := discoverCertificatesInPath(path)
		if err == nil {
			for _, cert := range certs {
				cert.VPNType = "ipsec"
				certificates = append(certificates, cert)
			}
		}
	}

	// Check Windows VPN certificates
	ipsecCerts, err := discoverIPSecWindowsCertificates()
	if err == nil {
		certificates = append(certificates, ipsecCerts...)
	}

	fmt.Printf("✅ [VPN] Encontrados %d certificados de IPsec\n", len(certificates))
	return certificates, nil
}

// discoverCertificatesInPath discovers certificates in a directory path
func discoverCertificatesInPath(path string) ([]VPNCertificateInfo, error) {
	var certificates []VPNCertificateInfo

	// Use find command on Linux/Mac or dir on Windows
	var cmd *exec.Cmd
	if isWindows() {
		cmd = exec.Command("powershell", "-Command", fmt.Sprintf(`
			Try {
				if (Test-Path '%s') {
					$files = Get-ChildItem -Path '%s' -Filter *.crt -Recurse -ErrorAction SilentlyContinue
					foreach ($file in $files) {
						try {
							$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($file.FullName)
							$parser = New-Object System.IdentityModel.Tokens.X509SecurityToken($cert, $false)
							Write-Output "$($cert.Subject)|$($cert.Thumbprint)|$($cert.NotAfter)|$($cert.SerialNumber)|$($cert.Issuer)"
						} Catch {
							# Skip invalid certificates
						}
					}
				}
			} Catch {
				Write-Output "ERROR"
			}
		`, path, path))
	} else {
		cmd = exec.Command("bash", "-c", fmt.Sprintf(`
			if [ -d "%s" ]; then
				find "%s" -name "*.crt" -o -name "*.pem" 2>/dev/null | head -20 | while read file; do
					if [ -f "$file" ]; then
						openssl x509 -in "$file" -noout -subject -fingerprint -enddate 2>/dev/null
					fi
				done
			fi
		`, path, path))
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return certificates, err
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if line != "" && !strings.Contains(line, "ERROR") {
			cert := parseCertificateLine(line)
			if cert.CommonName != "" {
				certificates = append(certificates, cert)
			}
		}
	}

	return certificates, nil
}

// discoverOpenVPNWindowsCertificates discovers OpenVPN certificates in Windows
func discoverOpenVPNWindowsCertificates() ([]VPNCertificateInfo, error) {
	var certificates []VPNCertificateInfo

	cmd := exec.Command("powershell", "-Command", `
		Try {
			# Check OpenVPN easy-rsa certificates
			$openvpnPaths = @(
				"$env:APPDATA\\OpenVPN",
				"$env:ProgramFiles\\OpenVPN",
				"$env:ProgramFiles(x86)\\OpenVPN"
			)
			
			foreach ($ovpnPath in $openvpnPaths) {
				if (Test-Path "$ovpnPath\\easy-rsa\\keys") {
					$keysPath = "$ovpnPath\\easy-rsa\\keys"
					$files = Get-ChildItem -Path $keysPath -Filter *.crt -ErrorAction SilentlyContinue
					foreach ($file in $files) {
						try {
							$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($file.FullName)
							Write-Output "openvpn|$($cert.Subject)|$($cert.Thumbprint)|$($cert.NotAfter)|$($cert.SerialNumber)|$($cert.Issuer)"
						} Catch {
							# Skip
						}
					}
				}
			}
		} Catch {
			Write-Output "ERROR"
		}
	`)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return certificates, err
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "openvpn|") {
			parts := strings.Split(line, "|")
			if len(parts) >= 6 {
				certificates = append(certificates, VPNCertificateInfo{
					VPNType:      "openvpn",
					CommonName:   parts[1],
					Fingerprint:  parts[2],
					ExpiryDate:   parts[3],
					SerialNumber: parts[4],
					Issuer:       parts[5],
					IsValid:      true,
				})
			}
		}
	}

	return certificates, nil
}

// discoverIPSecWindowsCertificates discovers IPsec certificates in Windows
func discoverIPSecWindowsCertificates() ([]VPNCertificateInfo, error) {
	var certificates []VPNCertificateInfo

	cmd := exec.Command("powershell", "-Command", `
		Try {
			# Check Windows IPsec certificates in machine store
			$certs = Get-ChildItem -Path Cert:\\LocalMachine\\My -ErrorAction SilentlyContinue | Where-Object {
				$_.EnhancedKeyUsageList | Where-Object { 
					$_.FriendlyName -eq "IP Security IKE Intermediate" -or 
					$_.FriendlyName -eq "Client Authentication" 
				}
			}
			
			foreach ($cert in $certs) {
				Write-Output "ipsec|$($cert.Subject)|$($cert.Thumbprint)|$($cert.NotAfter)|$($cert.SerialNumber)|$($cert.Issuer)"
			}
		} Catch {
			Write-Output "ERROR"
		}
	`)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return certificates, err
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "ipsec|") {
			parts := strings.Split(line, "|")
			if len(parts) >= 6 {
				certificates = append(certificates, VPNCertificateInfo{
					VPNType:      "ipsec",
					CommonName:   parts[1],
					Fingerprint:  parts[2],
					ExpiryDate:   parts[3],
					SerialNumber: parts[4],
					Issuer:       parts[5],
					IsValid:      true,
				})
			}
		}
	}

	return certificates, nil
}

// parseCertificateLine parses a certificate line from command output
func parseCertificateLine(line string) VPNCertificateInfo {
	// Different parsing logic for Windows and Unix
	if isWindows() {
		parts := strings.Split(line, "|")
		if len(parts) >= 5 {
			return VPNCertificateInfo{
				CommonName:   parts[0],
				Fingerprint:  parts[1],
				ExpiryDate:   parts[2],
				SerialNumber: parts[3],
				Issuer:       parts[4],
				IsValid:      true,
			}
		}
	} else {
		// Parse openssl output format
		// subject=... issuer=...
		// sha1 Fingerprint=...
		// notAfter=...
		return VPNCertificateInfo{
			CommonName:  extractValue(line, "subject"),
			Fingerprint: extractValue(line, "sha1 Fingerprint"),
			ExpiryDate:  extractValue(line, "notAfter"),
			IsValid:     true,
		}
	}

	return VPNCertificateInfo{}
}

// extractValue extracts a value from openssl output
func extractValue(text string, key string) string {
	start := strings.Index(text, key+"=")
	if start == -1 {
		return ""
	}
	start += len(key) + 1
	end := strings.Index(text[start:], " ")
	if end == -1 {
		return strings.TrimSpace(text[start:])
	}
	return strings.TrimSpace(text[start : start+end])
}

// DiscoverVPNServers discovers active VPN servers
func DiscoverVPNServers() ([]VPNConfiguration, error) {
	var servers []VPNConfiguration

	fmt.Println("🔍 [VPN] Descubriendo servidores VPN activos...")

	// Check for OpenVPN
	openvpnActive, openvpnPort := checkOpenVPNService()
	if openvpnActive {
		servers = append(servers, VPNConfiguration{
			VPNType:       "openvpn",
			ServerAddress: "localhost",
			Port:          openvpnPort,
			Protocol:      "UDP",
			CertPath:      "/etc/openvpn",
			IsActive:      true,
		})
	}

	// Check for IPsec
	ipsecActive := checkIPSecService()
	if ipsecActive {
		servers = append(servers, VPNConfiguration{
			VPNType:       "ipsec",
			ServerAddress: "localhost",
			Port:          500,
			Protocol:      "UDP",
			CertPath:      "/etc/ipsec.d",
			IsActive:      true,
		})
	}

	fmt.Printf("✅ [VPN] Encontrados %d servidores VPN activos\n", len(servers))
	return servers, nil
}

// checkOpenVPNService checks if OpenVPN service is running
func checkOpenVPNService() (bool, int) {
	cmd := exec.Command("powershell", "-Command", `
		Try {
			$service = Get-Service -Name 'OpenVPNService' -ErrorAction Stop
			if ($service.Status -eq 'Running') {
				Write-Output "RUNNING"
			}
		} Catch {
			# Try Linux/Mac
			pidof openvpn > /dev/null 2>&1
			if [ $? -eq 0 ]; then
				Write-Output "RUNNING"
			fi
		}
	`)

	output, err := cmd.CombinedOutput()
	if err == nil && strings.Contains(string(output), "RUNNING") {
		return true, 1194 // Default OpenVPN port
	}

	return false, 0
}

// checkIPSecService checks if IPsec service is running
func checkIPSecService() bool {
	cmd := exec.Command("powershell", "-Command", `
		Try {
			$service = Get-Service -Name 'IKEEXT' -ErrorAction Stop
			if ($service.Status -eq 'Running') {
				Write-Output "RUNNING"
			}
		} Catch {
			# Try Linux/Mac
			systemctl is-active strongswan > /dev/null 2>&1
			if [ $? -eq 0 ]; then
				Write-Output "RUNNING"
			fi
		}
	`)

	output, err := cmd.CombinedOutput()
	if err == nil && strings.Contains(string(output), "RUNNING") {
		return true
	}

	return false
}

// ValidateVPNCertificates validates VPN certificates
func ValidateVPNCertificates(certs []VPNCertificateInfo) []VPNCertificateInfo {
	var validCerts []VPNCertificateInfo

	fmt.Printf("🔍 [VPN] Validando %d certificados...\n", len(certs))

	for _, cert := range certs {
		// Check if certificate is valid (not expired, etc.)
		isValid := validateCertificate(&cert)
		cert.IsValid = isValid

		if isValid {
			validCerts = append(validCerts, cert)
		} else {
			fmt.Printf("⚠️ [VPN] Certificado inválido: %s\n", cert.CommonName)
		}
	}

	fmt.Printf("✅ [VPN] %d/%d certificados válidos\n", len(validCerts), len(certs))
	return validCerts
}

// validateCertificate validates a single certificate
func validateCertificate(cert *VPNCertificateInfo) bool {
	// Basic validation - check if expiry date is in the future
	// In a real implementation, this would parse the date and compare with current time
	return cert.ExpiryDate != "" && !strings.Contains(cert.ExpiryDate, "expired")
}

// GetVPNCertificateSummary returns a summary of VPN certificates
func GetVPNCertificateSummary() (string, error) {
	openvpnCerts, _ := DiscoverOpenVPNCertificates()
	ipsecCerts, _ := DiscoverIPSecCertificates()
	servers, _ := DiscoverVPNServers()

	summary := fmt.Sprintf("VPN Certificates Summary:\n"+
		"- OpenVPN Certificates: %d\n"+
		"- IPsec Certificates: %d\n"+
		"- Active VPN Servers: %d\n"+
		"- Total Certificates: %d\n",
		len(openvpnCerts),
		len(ipsecCerts),
		len(servers),
		len(openvpnCerts)+len(ipsecCerts))

	return summary, nil
}
