workspace {
    !identifiers hierarchical
    model {
        shop = softwareSystem "Shop" {
            backend = group "Backend" {
                api = container "API"
            }
        }
    }
    views {
        container shop "Backend" {
            include backend
        }
    }
}
