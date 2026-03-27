/**
 * ADCS (Active Directory Certificate Services) Integration
 * Auto-Discovery y gestión de certificados de empresa
 */

package main

import (
	"fmt"
	"os/exec"
	"strings"
)

// ADCSConfiguration holds ADCS server configuration
type ADCSConfiguration struct {
	ServerName   string
	Template     string
	CAThumbprint string
	IsEnterprise bool
}

// ADCCertificateInfo holds certificate information from ADCS
type ADCCertificateInfo struct {
	TemplateName     string
	Subject          string
	Thumbprint       string
	NotBefore        string
	NotAfter         string
	SerialNumber     string
	KeyUsage         string
	EnhancedKeyUsage string
	IssuedBy         string
	CAThumbprint     string
}

// DiscoverADCSEndpoints discovers ADCS certificate authorities
func DiscoverADCSEndpoints() ([]ADCSConfiguration, error) {
	var endpoints []ADCSConfiguration

	fmt.Println("🔍 [ADCS] Descubriendo servicios de Certificate Authority...")

	// Query for ADCS Enterprise CAs using PowerShell
	cmd := exec.Command("powershell", "-Command", `
		Try {
			Import-Module ServerManager -ErrorAction Stop
			$adcs = Get-WindowsFeature -Name ADCS-Cert-Authority
			if ($adcs.Installed) {
				Write-Output "ADCS_INSTALLED"
			}
		} Catch {
			Write-Output "ADCS_NOT_INSTALLED"
		}
	`)

	output, err := cmd.CombinedOutput()
	if err == nil && strings.Contains(string(output), "ADCS_INSTALLED") {
		fmt.Println("✅ [ADCS] Certificate Authority detectado")

		// Get CA information
		caCmd := exec.Command("powershell", "-Command", `
			Try {
				$certs = Get-ChildItem -Path Cert:\\LocalMachine\\CA
				foreach ($cert in $certs) {
					Write-Output "CA:$($cert.Subject)|$($cert.Thumbprint)|$($cert.NotAfter)"
				}
			} Catch {
				Write-Output "ERROR:GetCA"
			}
		`)

		caOutput, err := caCmd.CombinedOutput()
		if err == nil {
			lines := strings.Split(string(caOutput), "\n")
			for _, line := range lines {
				if strings.HasPrefix(line, "CA:") {
					parts := strings.Split(strings.TrimPrefix(line, "CA:"), "|")
					if len(parts) >= 3 {
						endpoints = append(endpoints, ADCSConfiguration{
							ServerName:   "localhost",
							Template:     "EnterpriseCA",
							CAThumbprint: parts[1],
							IsEnterprise: true,
						})
					}
				}
			}
		}
	} else {
		fmt.Println("ℹ️ [ADCS] Certificate Authority no instalado")
	}

	return endpoints, nil
}

// DiscoverADCSCertificates discovers certificates issued by ADCS
func DiscoverADCSCertificates() ([]ADCCertificateInfo, error) {
	var certificates []ADCCertificateInfo

	fmt.Println("🔍 [ADCS] Descubriendo certificados de ADCS...")

	// Get certificates from various ADCS stores
	certStores := []string{
		"Cert:\\LocalMachine\\My",
		"Cert:\\LocalMachine\\CA",
		"Cert:\\CurrentUser\\My",
	}

	for _, store := range certStores {
		certs, err := getCertificatesFromStore(store)
		if err == nil {
			for _, cert := range certs {
				if isADCSCertificate(cert) {
					certificates = append(certificates, cert)
				}
			}
		}
	}

	fmt.Printf("✅ [ADCS] Encontrados %d certificados de ADCS\n", len(certificates))
	return certificates, nil
}

// getCertificatesFromStore retrieves certificates from a certificate store
func getCertificatesFromStore(storePath string) ([]ADCCertificateInfo, error) {
	var certificates []ADCCertificateInfo

	cmd := exec.Command("powershell", "-Command", fmt.Sprintf(`
		Try {
			$certs = Get-ChildItem -Path '%s' -ErrorAction Stop
			foreach ($cert in $certs) {
				$eku = ""
				if ($cert.Extensions) {
					foreach ($ext in $cert.Extensions) {
						if ($ext.Oid.FriendlyName -eq "Enhanced Key Usage") {
							$eku = $ext.EnhancedKeyUsages.Value
						}
					}
				}
				Write-Output "$($cert.Subject)|$($cert.Thumbprint)|$($cert.NotBefore)|$($cert.NotAfter)|$($cert.SerialNumber)|$($eku)"
			}
		} Catch {
			Write-Output "ERROR"
		}
	`, storePath))

	output, err := cmd.CombinedOutput()
	if err != nil {
		return certificates, err
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if !strings.Contains(line, "ERROR") && strings.Contains(line, "|") {
			parts := strings.Split(line, "|")
			if len(parts) >= 6 {
				cert := ADCCertificateInfo{
					Subject:          parts[0],
					Thumbprint:       parts[1],
					NotBefore:        parts[2],
					NotAfter:         parts[3],
					SerialNumber:     parts[4],
					EnhancedKeyUsage: parts[5],
				}
				certificates = append(certificates, cert)
			}
		}
	}

	return certificates, nil
}

// isADCSCertificate determines if a certificate was issued by ADCS
func isADCSCertificate(cert ADCCertificateInfo) bool {
	// Check if certificate has ADCS-specific characteristics
	adcsEKUs := []string{
		"Server Authentication",
		"Client Authentication",
		"Smart Card Logon",
		"Kerberos Authentication",
		"Document Signing",
		"Code Signing",
	}

	for _, eku := range adcsEKUs {
		if strings.Contains(cert.EnhancedKeyUsage, eku) {
			return true
		}
	}

	return false
}

// GetADCSTemplates discovers available ADCS certificate templates
func GetADCSTemplates() ([]string, error) {
	var templates []string

	fmt.Println("🔍 [ADCS] Descubriendo plantillas de certificados...")

	cmd := exec.Command("powershell", "-Command", `
		Try {
			Import-Module ActiveDirectory -ErrorAction Stop
			$templates = Get-ADObject -Filter { objectClass -eq 'pKICertificateTemplate' } -Properties *
			foreach ($tmpl in $templates) {
				Write-Output $tmpl.Name
			}
		} Catch {
			Write-Output "ERROR:GetTemplates"
		}
	`)

	output, err := cmd.CombinedOutput()
	if err == nil && !strings.Contains(string(output), "ERROR:GetTemplates") {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if line != "" && !strings.HasPrefix(line, "ERROR") {
				templates = append(templates, strings.TrimSpace(line))
			}
		}
	}

	fmt.Printf("✅ [ADCS] Encontradas %d plantillas de certificados\n", len(templates))
	return templates, nil
}

// RequestADCCertificate requests a new certificate from ADCS
func RequestADCCertificate(templateName string, subject string) (bool, error) {
	fmt.Printf("🔧 [ADCS] Solicitando certificado con plantilla %s...\n", templateName)

	// This would use certreq.exe to request a certificate from ADCS
	cmd := exec.Command("powershell", "-Command", fmt.Sprintf(`
		Try {
			$inf = @"
[NewRequest]
Subject = "%s"
Template = %s
KeyLength = 2048
KeyAlgorithm = RSA
Exportable = TRUE
MachineKeySet = TRUE
[RequestAttributes]
CertificateTemplate = %s
"@
			$inf | Out-File -FilePath "$env:TEMP\\certrequest.inf" -Encoding ASCII
			certreq -new "$env:TEMP\\certrequest.inf" "$env:TEMP\\cert.cer"
			Write-Output "SUCCESS"
		} Catch {
			Write-Output "ERROR:RequestCert"
		}
	`, subject, templateName, templateName))

	output, err := cmd.CombinedOutput()
	if err == nil && strings.Contains(string(output), "SUCCESS") {
		fmt.Println("✅ [ADCS] Certificado solicitado exitosamente")
		return true, nil
	}

	fmt.Printf("❌ [ADCS] Error solicitando certificado: %s\n", string(output))
	return false, err
}

// ValidateADCSConnection validates connectivity to ADCS
func ValidateADCSConnection() (bool, error) {
	fmt.Println("🔍 [ADCS] Validando conexión con Certificate Authority...")

	// Check if ADCS service is running
	cmd := exec.Command("powershell", "-Command", `
		Try {
			$service = Get-Service -Name 'CertSvc' -ErrorAction Stop
			if ($service.Status -eq 'Running') {
				Write-Output "CONNECTED"
			} else {
				Write-Output "DISCONNECTED"
			}
		} Catch {
			Write-Output "ERROR"
		}
	`)

	output, err := cmd.CombinedOutput()
	if err == nil && strings.Contains(string(output), "CONNECTED") {
		fmt.Println("✅ [ADCS] Conexión exitosa con Certificate Authority")
		return true, nil
	}

	fmt.Println("❌ [ADCS] No se puede conectar con Certificate Authority")
	return false, err
}
