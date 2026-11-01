workspace {
    model {
        user = person "User"
        team = group "Team" {
            shop = softwareSystem "Shop"
        }
        payments = softwareSystem "Payments"
        user -> shop "Orders"
        shop -> payments "Charges"
    }
    views {
        systemLandscape "Landscape" {
            include user
            animationStep user
            include team payments
            animation {
                team
                payments user
            }
        }
    }
}
