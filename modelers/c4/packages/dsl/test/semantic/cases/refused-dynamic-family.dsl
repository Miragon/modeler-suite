workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        payments = softwareSystem "Payments" {
            gateway = container "Gateway"
        }
        web -> gateway "Charges"
    }
    views {
        dynamic shop "Steps" {
            web -> payments
            web -> gateway
        }
    }
}
